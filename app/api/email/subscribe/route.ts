/**
 * POST /api/email/subscribe   { email, locale? }
 *
 * Owned double opt-in signup (replaces the Buttondown proxy). Inserts a
 * `pending` row into email_subscribers (the list now lives in our Neon DB,
 * the source of truth) and sends a confirmation email via Amazon SES. The
 * subscriber becomes `confirmed` only after clicking the confirm link.
 *
 * Gracefully degrades to 503 when SES isn't configured, so the form shows a
 * "not available" message instead of erroring. Honeypot + deep email
 * validation are preserved; a hashed-email audit row is still written for
 * DPDP / right-to-know requests.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { recordAudit } from "@/lib/observability/audit";
import { validateEmailDeep } from "@/lib/validation/email";
import { sendEmail, emailConfigured } from "@/lib/email/mailer";
import {
  upsertPendingSubscriber,
  confirmUrl,
  unsubscribeUrl,
} from "@/lib/email/subscribers";
import { confirmEmail } from "@/lib/email/templates";

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

  if (!emailConfigured()) {
    return NextResponse.json(
      { error: "email_disabled", detail: "Set AUTH_RESEND_* (or SES_*) envs to enable list signup." },
      { status: 503 },
    );
  }

  const outcome = await upsertPendingSubscriber(cleanEmail, locale);

  // Already confirmed → idempotent success, no second confirmation email.
  if (outcome.alreadyConfirmed) {
    const fp = createHash("sha256").update(cleanEmail).digest("hex").slice(0, 16);
    void recordAudit({
      actor: "public:subscribe",
      action: "email_subscribe",
      meta: { fingerprint: fp, locale: locale ?? null, alreadyConfirmed: true },
    });
    return NextResponse.json({ ok: true, alreadyConfirmed: true });
  }

  const tpl = confirmEmail({
    confirmUrl: confirmUrl(outcome.confirmToken),
    unsubUrl: unsubscribeUrl(outcome.unsubToken),
  });
  const sent = await sendEmail({
    to: cleanEmail,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    listUnsubscribeUrl: unsubscribeUrl(outcome.unsubToken),
  });

  if (!sent.ok) {
    return NextResponse.json(
      { error: "email_send_failed", detail: sent.reason },
      { status: 502 },
    );
  }

  const fingerprint = createHash("sha256").update(cleanEmail).digest("hex").slice(0, 16);
  void recordAudit({
    actor: "public:subscribe",
    action: "email_subscribe",
    meta: { fingerprint, locale: locale ?? null, status: "pending" },
  });

  return NextResponse.json({ ok: true, pending: true });
}
