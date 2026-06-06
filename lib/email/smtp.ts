/**
 * Generic SMTP transport for the owned newsletter + contact form.
 *
 * Works with ANY SMTP server by env alone — no code change to switch:
 *   - Gmail:  SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_SECURE=true
 *             SMTP_USER=you@gmail.com  SMTP_PASS=<16-char App Password>
 *   - Brevo:  SMTP_HOST=smtp-relay.brevo.com SMTP_PORT=587 SMTP_SECURE=false
 *             SMTP_USER=<brevo login>  SMTP_PASS=<brevo SMTP key>
 *
 * This is the "free, no custom domain" path: providers like Gmail/Brevo let
 * you send to any recipient after verifying a single sender — no domain DNS
 * required. Sets one-click List-Unsubscribe headers (RFC 8058) for bulk
 * deliverability, matching the SES/Resend transports.
 *
 * Degrades gracefully: smtpConfigured() is false when host/user/pass are
 * missing, and send() returns { ok:false, skipped:true } instead of throwing.
 */

import nodemailer, { type Transporter } from "nodemailer";
import type { SendArgs, SendResult } from "@/lib/email/ses";

export function smtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function fromAddress(): string {
  return (
    process.env.SMTP_FROM ||
    process.env.NEWSLETTER_FROM ||
    (process.env.SMTP_USER as string)
  );
}

let transporter: Transporter | null = null;
function getTransport(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    // `secure` defaults to true for port 465 (implicit TLS), false otherwise
    // (587 upgrades via STARTTLS). Operators can force it with SMTP_SECURE.
    const secure =
      process.env.SMTP_SECURE != null
        ? process.env.SMTP_SECURE.toLowerCase() === "true"
        : port === 465;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendViaSmtp(args: SendArgs): Promise<SendResult> {
  if (!smtpConfigured()) {
    return { ok: false, skipped: true, reason: "SMTP not configured (set SMTP_HOST + SMTP_USER + SMTP_PASS)" };
  }

  const headers: Record<string, string> = {};
  if (args.listUnsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${args.listUnsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  try {
    const info = await getTransport().sendMail({
      from: fromAddress(),
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
      replyTo: args.replyTo,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
    return { ok: true, messageId: info.messageId ?? "" };
  } catch (e) {
    return { ok: false, skipped: false, reason: String((e as Error).message).slice(0, 300) };
  }
}
