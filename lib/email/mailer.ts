/**
 * Provider-agnostic mail entry point for the owned newsletter.
 *
 * Dispatch order:
 *   1. Amazon SES, when fully configured (SES_FROM + AWS_* envs).
 *   2. Resend, reusing the Auth.js credentials already live in production
 *      (AUTH_RESEND_KEY + AUTH_RESEND_FROM / NEWSLETTER_FROM).
 *
 * This lets the digest + double opt-in flows work as soon as EITHER provider
 * is set, so the signup form stops returning 503 the moment Resend is present.
 * Callers gate the feature on `emailConfigured()` and send with `sendEmail()`.
 */

import { sesConfigured, sendViaSes, type SendArgs, type SendResult } from "@/lib/email/ses";
import { resendConfigured, sendViaResend } from "@/lib/email/resend";

export type { SendArgs, SendResult } from "@/lib/email/ses";

/** True when at least one email provider can send. */
export function emailConfigured(): boolean {
  return sesConfigured() || resendConfigured();
}

/** Human-readable name of the active provider (for logs/audits). */
export function emailProvider(): "ses" | "resend" | "none" {
  if (sesConfigured()) return "ses";
  if (resendConfigured()) return "resend";
  return "none";
}

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  if (sesConfigured()) return sendViaSes(args);
  if (resendConfigured()) return sendViaResend(args);
  return {
    ok: false,
    skipped: true,
    reason: "No email provider configured (set AUTH_RESEND_* or SES_* envs)",
  };
}
