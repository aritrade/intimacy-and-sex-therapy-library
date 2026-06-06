/**
 * POST /api/contact
 *   { name, email, role, organization?, subject, message, website? }
 *
 * Public "Contact Us" endpoint. On a valid submission it emails the site
 * operator and sets Reply-To to the submitter so the operator can reply
 * directly. The destination inbox lives ONLY on the server (CONTACT_TO env,
 * defaulting to the owner address) and is never returned to the client — the
 * form gives no hint of who receives it.
 *
 * Open to anyone: individuals, patients, clinicians, psychologists, doctors,
 * and private sexology / IVF / healthcare centers (see `role`).
 *
 * Anti-abuse: honeypot `website` field, per-IP in-memory rate limit, Zod size
 * caps, deep email validation. Degrades to 503 when no email provider is set.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { recordAudit } from "@/lib/observability/audit";
import { validateEmailDeep } from "@/lib/validation/email";
import { sendEmail, emailConfigured } from "@/lib/email/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who is reaching out — drives routing/labels but never gates submission. */
const ROLES = [
  "individual",
  "patient",
  "clinician",
  "psychologist",
  "doctor",
  "sexology_center",
  "ivf_center",
  "other",
] as const;

const ROLE_LABEL: Record<(typeof ROLES)[number], string> = {
  individual: "Individual / general visitor",
  patient: "Patient",
  clinician: "Clinician / sex therapist",
  psychologist: "Psychologist",
  doctor: "Doctor",
  sexology_center: "Sexology / sexual-health centre",
  ivf_center: "IVF / fertility centre",
  other: "Other",
};

const Body = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(320),
  role: z.enum(ROLES).default("individual"),
  organization: z.string().max(160).optional(),
  subject: z.string().min(2).max(160),
  message: z.string().min(10).max(4000),
  /** Honeypot: if filled, silently 200 — bots get fooled. */
  website: z.string().optional(),
});

// In-memory per-IP rate limit: one message per IP per 10 min. Survives only
// the serverless instance lifetime, so it's a "no double-tap" guard.
const RATE_LIMIT_MS = 10 * 60 * 1000;
const lastSeen = new Map<string, number>();

function hashIp(ip: string): string {
  const pepper = process.env.FEEDBACK_IP_PEPPER ?? "fallback-pepper-do-not-rely-on";
  return createHash("sha256").update(`${ip}|${pepper}`).digest("hex").slice(0, 32);
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "0.0.0.0";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const { name, email, role, organization, subject, message, website } = parsed.data;
  if (website) {
    return NextResponse.json({ ok: true, honeypotted: true });
  }

  const emailCheck = await validateEmailDeep(email);
  if (!emailCheck.ok) {
    return NextResponse.json(
      { error: "invalid_email", reason: emailCheck.reason, detail: emailCheck.hint },
      { status: 422 },
    );
  }
  const cleanEmail = emailCheck.normalized;

  if (!emailConfigured()) {
    return NextResponse.json(
      { error: "email_disabled", detail: "Contact form isn't available right now. Please try again later." },
      { status: 503 },
    );
  }

  const ip = getClientIp(req);
  const ipHash = hashIp(ip);
  const now = Date.now();
  const last = lastSeen.get(ipHash) ?? 0;
  if (now - last < RATE_LIMIT_MS) {
    const waitMin = Math.ceil((RATE_LIMIT_MS - (now - last)) / 60_000);
    return NextResponse.json(
      { error: "rate_limited", detail: `Please wait ~${waitMin} more minute${waitMin === 1 ? "" : "s"} before sending again.` },
      { status: 429 },
    );
  }

  // Destination is server-only; never exposed to the client.
  const to = process.env.CONTACT_TO || "aritrajob79@gmail.com";
  const roleLabel = ROLE_LABEL[role];
  const org = organization?.trim() || "—";

  const rows: Array<[string, string]> = [
    ["From", `${name} <${cleanEmail}>`],
    ["Role", roleLabel],
    ["Organization", org],
    ["Subject", subject],
  ];
  const htmlRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;vertical-align:top;white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:4px 0;color:#111827;">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><body style="margin:0;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">Contact form · Intimacy &amp; Sex Therapy Library</div>
    <h1 style="font-size:20px;margin:12px 0 16px;">New message from ${escapeHtml(name)}</h1>
    <table style="font-size:14px;line-height:1.5;border-collapse:collapse;">${htmlRows}</table>
    <h2 style="font-size:15px;margin:20px 0 8px;color:#374151;">Message</h2>
    <div style="font-size:15px;line-height:1.7;white-space:pre-wrap;border-left:3px solid #e5e7eb;padding-left:12px;">${escapeHtml(message)}</div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">
    <div style="font-size:12px;color:#9ca3af;">Reply directly to this email to respond to ${escapeHtml(cleanEmail)}.</div>
  </div>
</body></html>`;

  const text = [
    `New contact message — Intimacy & Sex Therapy Library`,
    "",
    `From: ${name} <${cleanEmail}>`,
    `Role: ${roleLabel}`,
    `Organization: ${org}`,
    `Subject: ${subject}`,
    "",
    "Message:",
    message,
    "",
    `Reply directly to this email to respond to ${cleanEmail}.`,
  ].join("\n");

  const sent = await sendEmail({
    to,
    subject: `[Contact · ${roleLabel}] ${subject}`,
    html,
    text,
    replyTo: cleanEmail,
  });

  const fingerprint = createHash("sha256").update(cleanEmail).digest("hex").slice(0, 16);

  if (!sent.ok) {
    void recordAudit({
      actor: "public:contact",
      action: "contact_send_failed",
      meta: { fingerprint, role, hasOrg: org !== "—", reason: sent.reason },
    });
    return NextResponse.json(
      { error: "send_failed", detail: "Couldn't send your message right now. Please try again later." },
      { status: 502 },
    );
  }

  lastSeen.set(ipHash, now);
  void recordAudit({
    actor: "public:contact",
    action: "contact_submitted",
    meta: { fingerprint, role, hasOrg: org !== "—", subjectLen: subject.length, messageLen: message.length },
  });

  return NextResponse.json({ ok: true });
}
