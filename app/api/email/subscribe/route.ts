/**
 * POST /api/email/subscribe   { email, locale? }
 *
 * Forwards the address to Buttondown's "Add subscriber" endpoint.
 * Stays a server-side proxy so we don't ship the API key to the
 * browser. Returns 503 when BUTTONDOWN_API_KEY is unset (the form
 * gracefully degrades to a "not available" message).
 *
 * Privacy: we never store the email server-side. Buttondown is the
 * source of truth; the only thing that hits our DB is an audit row
 * with the hashed email so we can answer "did this address sign up?"
 * during a DPDP / GDPR right-to-know request.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { recordAudit } from "@/lib/observability/audit";
import { validateEmailDeep } from "@/lib/validation/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(320),
  locale: z.string().max(8).optional(),
  /** Honeypot: if filled, silently 200 — bots get fooled. */
  website: z.string().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const { email, locale, website } = parsed.data;
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

  const key = process.env.BUTTONDOWN_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "email_disabled", detail: "Set BUTTONDOWN_API_KEY to enable list signup." },
      { status: 503 },
    );
  }

  const tags = ["website-signup"];
  if (locale) tags.push(`locale:${locale}`);

  const res = await fetch("https://api.buttondown.email/v1/subscribers", {
    method: "POST",
    headers: {
      Authorization: `Token ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email_address: cleanEmail,
      tags,
    }),
  });

  // Buttondown returns 201 on create, 400 with `subscribers must be unique`
  // when the email already exists — we treat that as success.
  const data = (await res.json().catch(() => ({}))) as { code?: string; detail?: string };
  if (!res.ok && data.code !== "email_already_exists") {
    return NextResponse.json(
      { error: "buttondown_failed", detail: data.detail ?? `${res.status}` },
      { status: 502 },
    );
  }

  const fingerprint = createHash("sha256").update(cleanEmail).digest("hex").slice(0, 16);
  void recordAudit({
    actor: "public:subscribe",
    action: "email_subscribe",
    meta: { fingerprint, locale: locale ?? null, alreadyExisted: data.code === "email_already_exists" },
  });

  return NextResponse.json({ ok: true, alreadyExisted: data.code === "email_already_exists" });
}
