/**
 * Thin Amazon SES (v2) sender.
 *
 * Used for the owned newsletter (double opt-in confirmation, weekly digest)
 * after migrating off Buttondown. Always sets one-click List-Unsubscribe
 * headers (RFC 8058) so Gmail/Yahoo bulk-sender requirements are met and the
 * "unsubscribe" affordance is native — important for deliverability given we
 * don't yet have a custom sending domain.
 *
 * Reads AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / SES_FROM.
 * Degrades gracefully: sesConfigured() is false when any of these is missing,
 * and send() returns { ok:false, skipped:true } rather than throwing.
 */

import {
  SESv2Client,
  SendEmailCommand,
  type MessageHeader,
} from "@aws-sdk/client-sesv2";

export type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** One-click unsubscribe URL (RFC 8058). Strongly recommended for bulk. */
  listUnsubscribeUrl?: string;
  /** Optional reply-to override. */
  replyTo?: string;
};

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; reason: string };

export function sesConfigured(): boolean {
  return !!(
    process.env.SES_FROM &&
    process.env.AWS_REGION &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );
}

let client: SESv2Client | null = null;
function getClient(): SESv2Client {
  if (!client) {
    client = new SESv2Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

export async function sendViaSes(args: SendArgs): Promise<SendResult> {
  if (!sesConfigured()) {
    return { ok: false, skipped: true, reason: "SES not configured (set SES_FROM + AWS_* envs)" };
  }

  const headers: MessageHeader[] = [];
  if (args.listUnsubscribeUrl) {
    headers.push({ Name: "List-Unsubscribe", Value: `<${args.listUnsubscribeUrl}>` });
    headers.push({ Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" });
  }

  try {
    const out = await getClient().send(
      new SendEmailCommand({
        FromEmailAddress: process.env.SES_FROM,
        Destination: { ToAddresses: [args.to] },
        ReplyToAddresses: args.replyTo ? [args.replyTo] : undefined,
        Content: {
          Simple: {
            Subject: { Data: args.subject, Charset: "UTF-8" },
            Body: {
              Html: { Data: args.html, Charset: "UTF-8" },
              Text: { Data: args.text, Charset: "UTF-8" },
            },
            Headers: headers.length > 0 ? headers : undefined,
          },
        },
      }),
    );
    return { ok: true, messageId: out.MessageId ?? "" };
  } catch (e) {
    return { ok: false, skipped: false, reason: String((e as Error).message).slice(0, 300) };
  }
}
