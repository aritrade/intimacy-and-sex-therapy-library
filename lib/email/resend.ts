/**
 * Resend transport for the owned newsletter (double opt-in confirmation +
 * weekly digest).
 *
 * Reuses the SAME Resend credentials the Auth.js email provider already uses
 * in production (`AUTH_RESEND_KEY` + `AUTH_RESEND_FROM`), so enabling the
 * newsletter needs no new vendor — the sending domain is already verified.
 * An optional `NEWSLETTER_FROM` overrides the From address for list mail
 * (e.g. "Library Digest <digest@yourdomain>") without touching auth email.
 *
 * Calls Resend's REST API directly with fetch so we add no npm dependency.
 * Always sets one-click List-Unsubscribe headers (RFC 8058) for bulk
 * deliverability, matching the SES sender's behaviour. Degrades gracefully:
 * resendConfigured() is false when the key/from are missing, and send()
 * returns { ok:false, skipped:true } instead of throwing.
 */

import type { SendArgs, SendResult } from "@/lib/email/ses";

export function resendConfigured(): boolean {
  return !!(
    process.env.AUTH_RESEND_KEY &&
    (process.env.NEWSLETTER_FROM || process.env.AUTH_RESEND_FROM)
  );
}

function fromAddress(): string {
  return (process.env.NEWSLETTER_FROM || process.env.AUTH_RESEND_FROM) as string;
}

export async function sendViaResend(args: SendArgs): Promise<SendResult> {
  if (!resendConfigured()) {
    return {
      ok: false,
      skipped: true,
      reason: "Resend not configured (set AUTH_RESEND_KEY + AUTH_RESEND_FROM or NEWSLETTER_FROM)",
    };
  }

  const headers: Record<string, string> = {};
  if (args.listUnsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${args.listUnsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.AUTH_RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
        reply_to: args.replyTo,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        skipped: false,
        reason: `Resend HTTP ${res.status}: ${detail.slice(0, 250)}`,
      };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, messageId: data.id ?? "" };
  } catch (e) {
    return { ok: false, skipped: false, reason: String((e as Error).message).slice(0, 300) };
  }
}
