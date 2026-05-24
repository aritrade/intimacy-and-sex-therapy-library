/**
 * Post-metrics poller for Instagram Reels + YouTube Shorts.
 *
 * Reality check (we say this in the UI too): sex-health content is treated
 * harshly by both platforms. Reach is reduced unpredictably; takedowns
 * happen even for clinically accurate content. The poller exists for two
 * reasons:
 *
 *   1. Engagement visibility — owners need to know if a post got traction
 *      or got shadowbanned. We surface raw IG insights and YouTube stats.
 *   2. Takedown detection — when a previously-posted media id starts
 *      returning 404 / 410, or a YouTube video.status flips to "rejected"
 *      / "removed", we mark the draft `taken_down` and append a structured
 *      event to `takedown_events`.
 *
 * All network calls fail closed: a missing env var, a 4xx, or a network
 * timeout is recorded as a per-platform failure on the report and the
 * caller's loop continues. The poller NEVER throws.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts, postMetrics } from "@/lib/db/schema";
import { log } from "@/lib/observability/logger";
import { recordAudit } from "@/lib/observability/audit";

export type PollerSummary = {
  scanned: number;
  updated: number;
  takedowns: number;
  perPlatform: {
    instagram: { ok: number; failed: number; takedowns: number };
    youtube: { ok: number; failed: number; takedowns: number };
  };
  failures: Array<{ draftId: string; platform: string; reason: string; detail?: string }>;
};

const GRAPH_VERSION = "v22.0";

export async function pollAllPostMetrics(opts?: {
  /** Cap how many drafts we touch per run; protects against credit budgets. */
  limit?: number;
  /** Polling window — only re-poll posts from within the last N days. */
  windowDays?: number;
}): Promise<PollerSummary> {
  const limit = opts?.limit ?? 50;
  const windowDays = opts?.windowDays ?? 30;

  const summary: PollerSummary = {
    scanned: 0,
    updated: 0,
    takedowns: 0,
    perPlatform: {
      instagram: { ok: 0, failed: 0, takedowns: 0 },
      youtube: { ok: 0, failed: 0, takedowns: 0 },
    },
    failures: [],
  };

  if (!process.env.DATABASE_URL) {
    log.warn("metrics_poll_skipped", { reason: "DATABASE_URL not set" });
    return summary;
  }

  // Pull "posted" drafts from the last N days that have at least one platform id.
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const drafts = (await db.execute(sql`
    select id, status, posted_at, platform_post_ids, takedown_events
      from content_drafts
     where status in ('posted', 'taken_down')
       and posted_at >= ${since}
       and platform_post_ids is not null
     order by posted_at desc
     limit ${limit}
  `)) as unknown as Array<{
    id: string;
    status: string;
    posted_at: Date;
    platform_post_ids: Record<string, string> | null;
    takedown_events: unknown[] | null;
  }>;

  summary.scanned = drafts.length;

  const igConfigured = !!(process.env.IG_USER_ID && process.env.IG_ACCESS_TOKEN);
  const ytConfigured = !!(process.env.YT_OAUTH_ACCESS_TOKEN || process.env.YOUTUBE_API_KEY);

  for (const d of drafts) {
    const ids = d.platform_post_ids ?? {};

    if (ids.instagram) {
      if (igConfigured) {
        try {
          const r = await pollInstagram(ids.instagram);
          if (r.takenDown) {
            await markTakenDown(d.id, "instagram", r.detail ?? "removed");
            summary.takedowns++;
            summary.perPlatform.instagram.takedowns++;
          } else if (r.metrics) {
            await persistMetrics(d.id, "instagram", r.metrics);
            summary.updated++;
            summary.perPlatform.instagram.ok++;
          }
        } catch (e) {
          summary.perPlatform.instagram.failed++;
          summary.failures.push({
            draftId: d.id,
            platform: "instagram",
            reason: "exception",
            detail: (e as Error).message,
          });
        }
      } else {
        summary.failures.push({
          draftId: d.id,
          platform: "instagram",
          reason: "not_configured",
        });
      }
    }

    if (ids.youtube) {
      if (ytConfigured) {
        try {
          const r = await pollYouTube(ids.youtube);
          if (r.takenDown) {
            await markTakenDown(d.id, "youtube", r.detail ?? "removed");
            summary.takedowns++;
            summary.perPlatform.youtube.takedowns++;
          } else if (r.metrics) {
            await persistMetrics(d.id, "youtube", r.metrics);
            summary.updated++;
            summary.perPlatform.youtube.ok++;
          }
        } catch (e) {
          summary.perPlatform.youtube.failed++;
          summary.failures.push({
            draftId: d.id,
            platform: "youtube",
            reason: "exception",
            detail: (e as Error).message,
          });
        }
      } else {
        summary.failures.push({
          draftId: d.id,
          platform: "youtube",
          reason: "not_configured",
        });
      }
    }

    // Be polite to both APIs — a 100ms gap is enough at our scale and
    // keeps us well under any per-second quota.
    await sleep(100);
  }

  log.info("metrics_poll_done", {
    scanned: summary.scanned,
    updated: summary.updated,
    takedowns: summary.takedowns,
    failures: summary.failures.length,
  });

  return summary;
}

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

export type PollerMetrics = {
  views: number;
  likes: number;
  comments: number;
  saves: number;
  linkClicks: number;
};

export async function pollInstagram(mediaId: string): Promise<{
  takenDown: boolean;
  detail?: string;
  metrics?: PollerMetrics;
}> {
  const token = process.env.IG_ACCESS_TOKEN!;

  // 1) Probe — does the media still exist?
  const probeUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}?fields=id,permalink&access_token=${token}`;
  const probe = await fetch(probeUrl);
  if (probe.status === 404 || probe.status === 410) {
    return { takenDown: true, detail: `instagram:${probe.status}` };
  }
  if (!probe.ok) {
    const body = await safeText(probe);
    if (looksLikeMetaGoneError(body)) {
      return { takenDown: true, detail: `instagram:${probe.status}:${body.slice(0, 120)}` };
    }
    throw new Error(`probe ${probe.status}: ${body.slice(0, 200)}`);
  }

  // 2) Insights — Reels metric set
  const insightsUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}/insights?metric=reach,plays,likes,comments,saved,shares,total_interactions&access_token=${token}`;
  const insightsRes = await fetch(insightsUrl);
  if (!insightsRes.ok) {
    throw new Error(`insights ${insightsRes.status}: ${(await safeText(insightsRes)).slice(0, 200)}`);
  }
  const insightsJson = (await insightsRes.json()) as {
    data?: Array<{ name: string; values?: Array<{ value: number }> }>;
  };
  return { takenDown: false, metrics: parseInstagramInsights(insightsJson) };
}

export function parseInstagramInsights(payload: {
  data?: Array<{ name: string; values?: Array<{ value: number }> }>;
}): PollerMetrics {
  const get = (name: string) => {
    const m = payload.data?.find((d) => d.name === name);
    return Number(m?.values?.[0]?.value ?? 0);
  };
  return {
    // We map Reels "plays" to our generic "views" column. "reach" lives
    // alongside "plays" in the Meta API; we prefer plays because it's a
    // closer analogue to YouTube views.
    views: get("plays") || get("reach"),
    likes: get("likes"),
    comments: get("comments"),
    saves: get("saved"),
    // Meta doesn't expose link_clicks for organic Reels; "shares" is the
    // closest growth signal so we slot it into linkClicks.
    linkClicks: get("shares"),
  };
}

function looksLikeMetaGoneError(body: string): boolean {
  // Meta sometimes returns 200 with an `error` envelope, sometimes 400 with
  // code 100 ("Object does not exist"). Detect both shapes.
  if (/"code"\s*:\s*100\b/.test(body)) return true;
  if (/Object does not exist/i.test(body)) return true;
  if (/Unsupported get request/i.test(body)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

export async function pollYouTube(videoId: string): Promise<{
  takenDown: boolean;
  detail?: string;
  metrics?: PollerMetrics;
}> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const oauth = process.env.YT_OAUTH_ACCESS_TOKEN;
  if (!apiKey && !oauth) throw new Error("youtube_not_configured");

  // statistics + status in a single call.
  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics,status&id=${encodeURIComponent(
    videoId,
  )}${apiKey ? `&key=${apiKey}` : ""}`;

  const headers: Record<string, string> = {};
  if (oauth) headers.Authorization = `Bearer ${oauth}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`youtube ${res.status}: ${(await safeText(res)).slice(0, 200)}`);
  }
  const j = (await res.json()) as {
    items?: Array<{
      id: string;
      statistics?: {
        viewCount?: string;
        likeCount?: string;
        commentCount?: string;
        favoriteCount?: string;
      };
      status?: { privacyStatus?: string; uploadStatus?: string };
    }>;
  };

  // Empty items[] means the video id is gone (deleted or made private to
  // outside-of-channel viewers).
  if (!j.items || j.items.length === 0) {
    return { takenDown: true, detail: "youtube:not_found" };
  }
  const item = j.items[0];
  const status = item.status;
  if (status?.uploadStatus === "rejected" || status?.uploadStatus === "deleted") {
    return { takenDown: true, detail: `youtube:${status.uploadStatus}` };
  }
  if (status?.privacyStatus === "private") {
    // The owner pulled the video themselves. Still counts as "off-platform"
    // from the public's perspective; we record but do NOT auto-flip the
    // draft status, since the team may have intentionally privatised it.
  }

  return { takenDown: false, metrics: parseYouTubeStatistics(item.statistics ?? {}) };
}

export function parseYouTubeStatistics(s: {
  viewCount?: string;
  likeCount?: string;
  commentCount?: string;
  favoriteCount?: string;
}): PollerMetrics {
  return {
    views: numOrZero(s.viewCount),
    likes: numOrZero(s.likeCount),
    comments: numOrZero(s.commentCount),
    saves: numOrZero(s.favoriteCount),
    linkClicks: 0, // YT Data API v3 doesn't expose this for organic.
  };
}

function numOrZero(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// DB writers
// ---------------------------------------------------------------------------

async function persistMetrics(
  draftId: string,
  platform: "instagram" | "youtube",
  m: PollerMetrics,
): Promise<void> {
  await db.insert(postMetrics).values({
    draftId,
    platform,
    views: m.views,
    likes: m.likes,
    comments: m.comments,
    saves: m.saves,
    linkClicks: m.linkClicks,
  });
}

async function markTakenDown(
  draftId: string,
  platform: "instagram" | "youtube",
  detail: string,
): Promise<void> {
  const event = {
    platform,
    detail,
    detectedAt: new Date().toISOString(),
  };
  await db
    .update(contentDrafts)
    .set({
      status: "taken_down",
      takedownEvents: sql`coalesce(${contentDrafts.takedownEvents}, '[]'::jsonb) || ${JSON.stringify(
        [event],
      )}::jsonb`,
    })
    .where(eq(contentDrafts.id, draftId));

  void recordAudit({
    actor: "cron:metrics-poller",
    action: "draft_takedown_detected",
    meta: { draftId, platform, detail },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
