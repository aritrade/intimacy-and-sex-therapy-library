/**
 * Weekly digest: builder + sender.
 *
 * buildDigest()  — assembles the content payload (recently published resources
 *                  + currently top-performing videos). Pure data; no sending.
 * sendDigest()   — renders the digest per-subscriber (each gets their own
 *                  one-click unsubscribe link) and dispatches via SES in a
 *                  throttled loop. Safe to run from a cron; fail-soft per row.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sendEmail, emailConfigured, emailProvider } from "@/lib/email/mailer";
import { digestEmail, type DigestItem } from "@/lib/email/templates";
import { unsubscribeUrl } from "@/lib/email/subscribers";
import { topPublicVideos } from "@/lib/admin/dashboard-stats";
import { BRAND_COPY } from "@/lib/brand/tokens";

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? BRAND_COPY.url).replace(/\/+$/, "");
}

export type Digest = {
  intro: string;
  resources: DigestItem[];
  videos: DigestItem[];
  /** True when there's enough fresh content to be worth sending. */
  hasContent: boolean;
};

export async function buildDigest(opts: { sinceDays?: number } = {}): Promise<Digest> {
  const sinceDays = opts.sinceDays ?? 7;
  const base = siteUrl();

  let resources: DigestItem[] = [];
  if (process.env.DATABASE_URL) {
    try {
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
      const rows = (await db.execute(sql`
        select slug, title, kind, created_at
          from resources
         where is_published = true
           and created_at >= ${since.toISOString()}
         order by created_at desc
         limit 8
      `)) as unknown as Array<{ slug: string; title: string; kind: string }>;
      resources = rows.map((r) => ({
        title: r.title,
        url: `${base}/resource/${r.slug}`,
        meta: r.kind,
      }));
    } catch {
      resources = [];
    }
  }

  const topVideos = await topPublicVideos(3);
  const videos: DigestItem[] = topVideos.map((v) => ({
    title: v.title,
    url: `https://www.youtube.com/watch?v=${v.youtubeId}`,
    meta: v.views > 0 ? `${v.views.toLocaleString()} views` : undefined,
  }));

  const intro =
    resources.length > 0
      ? `Here's what's new this week — ${resources.length} fresh, clinician-reviewed ${
          resources.length === 1 ? "resource" : "resources"
        }, plus a couple of videos worth your time.`
      : "No new resources landed this week, but here are a few videos worth revisiting.";

  return {
    intro,
    resources,
    videos,
    hasContent: resources.length > 0 || videos.length > 0,
  };
}

export type SendDigestResult = {
  attempted: number;
  sent: number;
  failed: number;
  skipped: boolean;
  reason?: string;
};

/** Sleep helper for crude SES throttling. */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Render + send the digest to every confirmed subscriber. `dryRun` builds and
 * counts recipients without dispatching. `maxPerSecond` throttles SES (sandbox
 * default is 1/s); default 5/s leaves headroom under production limits.
 */
export async function sendDigest(opts: {
  digest?: Digest;
  sinceDays?: number;
  dryRun?: boolean;
  maxPerSecond?: number;
} = {}): Promise<SendDigestResult> {
  if (!process.env.DATABASE_URL) {
    return { attempted: 0, sent: 0, failed: 0, skipped: true, reason: "DATABASE_URL unset" };
  }
  if (!opts.dryRun && !emailConfigured()) {
    return { attempted: 0, sent: 0, failed: 0, skipped: true, reason: "no email provider configured" };
  }

  const digest = opts.digest ?? (await buildDigest({ sinceDays: opts.sinceDays }));
  if (!digest.hasContent) {
    return { attempted: 0, sent: 0, failed: 0, skipped: true, reason: "no content this week" };
  }

  const recipients = (await db.execute(sql`
    select email, unsub_token from email_subscribers where status = 'confirmed'
  `)) as unknown as Array<{ email: string; unsub_token: string }>;

  const result: SendDigestResult = {
    attempted: recipients.length,
    sent: 0,
    failed: 0,
    skipped: false,
  };
  if (opts.dryRun) return result;

  // SES production allows high throughput; Resend (~2/s) and consumer SMTP
  // like Gmail want a gentle rate. Default conservatively per provider so the
  // loop doesn't get throttled/blocked.
  const defaultPerSecond = emailProvider() === "ses" ? 5 : 2;
  const perSecond = Math.max(1, opts.maxPerSecond ?? defaultPerSecond);
  const gapMs = Math.ceil(1000 / perSecond);

  for (const r of recipients) {
    const unsubUrl = unsubscribeUrl(r.unsub_token);
    const tpl = digestEmail({
      intro: digest.intro,
      resources: digest.resources,
      videos: digest.videos,
      unsubUrl,
    });
    const out = await sendEmail({
      to: r.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      listUnsubscribeUrl: unsubUrl,
    });
    if (out.ok) result.sent += 1;
    else result.failed += 1;
    await sleep(gapMs);
  }

  return result;
}
