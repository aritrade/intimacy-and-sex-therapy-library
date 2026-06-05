/**
 * Plain, deliverability-friendly HTML email templates.
 *
 * Kept intentionally simple (inline styles, single column, no remote CSS) so
 * they render in Gmail/Outlook/Apple Mail and don't trip spam heuristics.
 * Every template ships a matching plain-text part (built by the caller via the
 * `text` helpers) and a visible unsubscribe link in the footer.
 */

import { BRAND_COPY, BRAND_HEX } from "@/lib/brand/tokens";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(bodyHtml: string, unsubUrl: string): string {
  return `<!doctype html><html><body style="margin:0;background:${BRAND_HEX.bg_light};font-family:Arial,Helvetica,sans-serif;color:${BRAND_HEX.ink_light};">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${BRAND_HEX.ink_muted_light};">${escapeHtml(BRAND_COPY.shortName)}</div>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #e7e2da;margin:28px 0 14px;">
    <div style="font-size:12px;color:${BRAND_HEX.ink_muted_light};line-height:1.6;">
      You're receiving this because you signed up at ${escapeHtml(BRAND_COPY.domain)}.<br>
      <a href="${unsubUrl}" style="color:${BRAND_HEX.ink_muted_light};">Unsubscribe</a> · 18+ educational content.
    </div>
  </div>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${BRAND_HEX.warm};color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold;font-size:15px;">${escapeHtml(label)}</a>`;
}

export function confirmEmail(args: { confirmUrl: string; unsubUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Confirm your subscription — ${BRAND_COPY.shortName}`;
  const html = shell(
    `<h1 style="font-size:22px;margin:18px 0 8px;">Confirm your subscription</h1>
     <p style="font-size:15px;line-height:1.6;">Tap the button below to confirm you'd like the weekly digest of new, clinician-reviewed resources. If you didn't request this, you can ignore this email.</p>
     <p style="margin:22px 0;">${button(args.confirmUrl, "Confirm subscription")}</p>
     <p style="font-size:13px;color:${BRAND_HEX.ink_muted_light};line-height:1.6;">Or paste this link into your browser:<br>${args.confirmUrl}</p>`,
    args.unsubUrl,
  );
  const text = [
    `Confirm your subscription — ${BRAND_COPY.shortName}`,
    "",
    "Tap the link below to confirm you'd like the weekly digest of new, clinician-reviewed resources. If you didn't request this, ignore this email.",
    "",
    `Confirm: ${args.confirmUrl}`,
    "",
    `Unsubscribe: ${args.unsubUrl}`,
  ].join("\n");
  return { subject, html, text };
}

export type DigestItem = { title: string; url: string; meta?: string };

export function digestEmail(args: {
  intro: string;
  resources: DigestItem[];
  videos: DigestItem[];
  unsubUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `This week from ${BRAND_COPY.shortName}`;
  const section = (heading: string, items: DigestItem[]) =>
    items.length === 0
      ? ""
      : `<h2 style="font-size:17px;margin:24px 0 10px;">${escapeHtml(heading)}</h2>
         <ul style="padding-left:18px;margin:0;font-size:15px;line-height:1.7;">
           ${items
             .map(
               (i) =>
                 `<li><a href="${i.url}" style="color:${BRAND_HEX.teal_light};">${escapeHtml(i.title)}</a>${
                   i.meta ? ` <span style="color:${BRAND_HEX.ink_muted_light};">— ${escapeHtml(i.meta)}</span>` : ""
                 }</li>`,
             )
             .join("")}
         </ul>`;

  const html = shell(
    `<h1 style="font-size:22px;margin:18px 0 8px;">This week's reading</h1>
     <p style="font-size:15px;line-height:1.6;">${escapeHtml(args.intro)}</p>
     ${section("New resources", args.resources)}
     ${section("Popular videos", args.videos)}`,
    args.unsubUrl,
  );

  const lines: string[] = [`This week from ${BRAND_COPY.shortName}`, "", args.intro, ""];
  if (args.resources.length) {
    lines.push("New resources:");
    for (const r of args.resources) lines.push(`- ${r.title}: ${r.url}`);
    lines.push("");
  }
  if (args.videos.length) {
    lines.push("Popular videos:");
    for (const v of args.videos) lines.push(`- ${v.title}: ${v.url}`);
    lines.push("");
  }
  lines.push(`Unsubscribe: ${args.unsubUrl}`);
  return { subject, html, text: lines.join("\n") };
}
