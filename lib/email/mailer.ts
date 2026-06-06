/**
 * Provider-agnostic mail entry point for the owned newsletter.
 *
 * Dispatch order:
 *   1. Amazon SES, when fully configured (SES_FROM + AWS_* envs).
 *   2. Generic SMTP (Gmail / Brevo / any relay), when SMTP_* envs are set.
 *      The "free, no custom domain" path — send to anyone after verifying a
 *      single sender.
 *   3. Resend, reusing the Auth.js credentials already live in production
 *      (AUTH_RESEND_KEY + AUTH_RESEND_FROM / NEWSLETTER_FROM). Note: without a
 *      verified Resend domain this only delivers to the account owner.
 *
 * This lets the digest + double opt-in flows work as soon as ANY provider is
 * set, so the signup form stops returning 503. Callers gate the feature on
 * `emailConfigured()` and send with `sendEmail()`.
 */

import { sesConfigured, sendViaSes, type SendArgs, type SendResult } from "@/lib/email/ses";
import { smtpConfigured, sendViaSmtp } from "@/lib/email/smtp";
import { resendConfigured, sendViaResend } from "@/lib/email/resend";

export type { SendArgs, SendResult } from "@/lib/email/ses";

/** True when at least one email provider can send. */
export function emailConfigured(): boolean {
  return sesConfigured() || smtpConfigured() || resendConfigured();
}

/** Human-readable name of the active provider (for logs/audits). */
export function emailProvider(): "ses" | "smtp" | "resend" | "none" {
  if (sesConfigured()) return "ses";
  if (smtpConfigured()) return "smtp";
  if (resendConfigured()) return "resend";
  return "none";
}

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  if (sesConfigured()) return sendViaSes(args);
  if (smtpConfigured()) return sendViaSmtp(args);
  if (resendConfigured()) return sendViaResend(args);
  return {
    ok: false,
    skipped: true,
    reason: "No email provider configured (set SMTP_*, SES_*, or AUTH_RESEND_* envs)",
  };
}
