/**
 * Data helpers for the new /admin dashboards:
 *   - /admin/analytics   engagement + channel growth + per-post sparklines
 *   - /admin/feedback    submissions + per-day chart + per-category donut
 *   - /admin/subscribers Buttondown list + audit-log growth chart
 *
 * Every helper here:
 *   - Returns an empty shape when DATABASE_URL / required env is missing
 *     so the page renders a graceful "not configured" state instead of 500.
 *   - Aggregates server-side (Postgres window functions where useful)
 *     so the client only receives chartable arrays of {x, value}.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  auditLog,
  channelMetrics,
  contentDrafts,
  postMetrics,
  userFeedback,
} from "@/lib/db/schema";

type ChartPoint = { x: string; [series: string]: string | number };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * postgres-js's `Buffer.byteLength` path crashes when a JS `Date` is
 * passed as a template-string parameter (it tries to byteLength a
 * Date instance). Workaround: feed a full ISO timestamp string and
 * let Postgres coerce it on the server. This is consistent across
 * every query in this file.
 */
function tsParam(d: Date): string {
  return d.toISOString();
}

function emptyDayBuckets(days: number): Map<string, ChartPoint> {
  const out = new Map<string, ChartPoint>();
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    out.set(isoDate(d), { x: isoDate(d) });
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────
 * ENGAGEMENT (per-post + per-platform totals)
 * ────────────────────────────────────────────────────────────────── */

export type EngagementSnapshot = {
  configured: boolean;
  windowDays: number;
  totals: { views: number; likes: number; comments: number; saves: number };
  perPlatform: Array<{
    platform: string;
    views: number;
    likes: number;
    comments: number;
    saves: number;
    posts: number;
  }>;
  daily: ChartPoint[]; // last N days
  topPosts: Array<{
    draftId: string;
    brief: string;
    platforms: string[];
    postedAt: Date;
    views: number;
    likes: number;
    comments: number;
    sparkline: number[];
  }>;
};

export async function engagementSnapshot(windowDays = 30): Promise<EngagementSnapshot> {
  const empty: EngagementSnapshot = {
    configured: false,
    windowDays,
    totals: { views: 0, likes: 0, comments: 0, saves: 0 },
    perPlatform: [],
    daily: [],
    topPosts: [],
  };
  if (!process.env.DATABASE_URL) return empty;

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  // Latest per-platform-per-draft metric row (we take MAX(pulled_at)).
  // post_metrics is append-only so the latest row is the "current" snapshot.
  const latest = (await db.execute(sql`
    select pm.draft_id, pm.platform, pm.views, pm.likes, pm.comments, pm.saves
      from post_metrics pm
      join (
        select draft_id, platform, max(pulled_at) as t
          from post_metrics
         where pulled_at >= ${tsParam(since)}
         group by draft_id, platform
      ) latest
        on latest.draft_id = pm.draft_id
       and latest.platform = pm.platform
       and latest.t = pm.pulled_at
  `)) as unknown as Array<{
    draft_id: string;
    platform: string;
    views: number;
    likes: number;
    comments: number;
    saves: number;
  }>;

  const platformAgg = new Map<
    string,
    { views: number; likes: number; comments: number; saves: number; posts: Set<string> }
  >();
  let totalViews = 0;
  let totalLikes = 0;
  let totalComments = 0;
  let totalSaves = 0;
  for (const r of latest) {
    totalViews += Number(r.views);
    totalLikes += Number(r.likes);
    totalComments += Number(r.comments);
    totalSaves += Number(r.saves);
    let agg = platformAgg.get(r.platform);
    if (!agg) {
      agg = { views: 0, likes: 0, comments: 0, saves: 0, posts: new Set<string>() };
      platformAgg.set(r.platform, agg);
    }
    agg.views += Number(r.views);
    agg.likes += Number(r.likes);
    agg.comments += Number(r.comments);
    agg.saves += Number(r.saves);
    agg.posts.add(r.draft_id);
  }

  const perPlatform = Array.from(platformAgg.entries()).map(([platform, a]) => ({
    platform,
    views: a.views,
    likes: a.likes,
    comments: a.comments,
    saves: a.saves,
    posts: a.posts.size,
  }));

  // Daily aggregation — sum of latest-per-day for each platform.
  // We bucket by date(pulled_at) for the last N days.
  const daily = (await db.execute(sql`
    select
      to_char(pulled_at, 'YYYY-MM-DD') as day,
      platform,
      sum(views)::int as views
    from post_metrics
    where pulled_at >= ${tsParam(since)}
    group by day, platform
    order by day
  `)) as unknown as Array<{ day: string; platform: string; views: number }>;

  const buckets = emptyDayBuckets(windowDays);
  for (const r of daily) {
    const point = buckets.get(r.day);
    if (point) point[r.platform] = (point[r.platform] as number | undefined) ?? 0;
    if (point) point[r.platform] = ((point[r.platform] as number) ?? 0) + Number(r.views);
  }

  // Top 8 posts by views in window, with a 7-point sparkline of views.
  const topPostRows = (await db.execute(sql`
    select
      d.id as draft_id,
      d.brief,
      d.posted_at,
      d.platform_post_ids,
      coalesce(sum(pm.views), 0)::int as total_views,
      coalesce(sum(pm.likes), 0)::int as total_likes,
      coalesce(sum(pm.comments), 0)::int as total_comments
    from content_drafts d
    left join post_metrics pm
      on pm.draft_id = d.id
     and pm.pulled_at >= ${tsParam(since)}
    where d.status in ('posted', 'taken_down')
      and d.posted_at >= ${tsParam(since)}
    group by d.id
    order by total_views desc
    limit 8
  `)) as unknown as Array<{
    draft_id: string;
    brief: string;
    posted_at: Date;
    platform_post_ids: Record<string, string> | null;
    total_views: number;
    total_likes: number;
    total_comments: number;
  }>;

  const topPosts = await Promise.all(
    topPostRows.map(async (p) => {
      const spark = (await db.execute(sql`
        select to_char(pulled_at, 'YYYY-MM-DD') as day, sum(views)::int as v
          from post_metrics
         where draft_id = ${p.draft_id}
         group by day
         order by day desc
         limit 7
      `)) as unknown as Array<{ day: string; v: number }>;
      return {
        draftId: p.draft_id,
        brief: p.brief.slice(0, 120),
        platforms: Object.keys(p.platform_post_ids ?? {}),
        postedAt: p.posted_at,
        views: Number(p.total_views),
        likes: Number(p.total_likes),
        comments: Number(p.total_comments),
        sparkline: spark.reverse().map((r) => Number(r.v)),
      };
    }),
  );

  return {
    configured: true,
    windowDays,
    totals: { views: totalViews, likes: totalLikes, comments: totalComments, saves: totalSaves },
    perPlatform,
    daily: Array.from(buckets.values()),
    topPosts,
  };
}

/* ────────────────────────────────────────────────────────────────────
 * CHANNEL FOLLOWERS (latest snapshot + growth time series)
 * ────────────────────────────────────────────────────────────────── */

export type ChannelSnapshotView = {
  configured: boolean;
  latest: Array<{
    platform: string;
    handle: string | null;
    followers: number;
    posts: number;
    totalViews: number;
    pulledAt: Date;
  }>;
  followersOverTime: ChartPoint[];
};

export async function channelSnapshotView(windowDays = 90): Promise<ChannelSnapshotView> {
  if (!process.env.DATABASE_URL) {
    return { configured: false, latest: [], followersOverTime: [] };
  }
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  // Latest per platform.
  const latest = (await db.execute(sql`
    select cm.*
      from channel_metrics cm
      join (
        select platform, max(pulled_at) as t
          from channel_metrics
         group by platform
      ) latest
        on latest.platform = cm.platform
       and latest.t = cm.pulled_at
  `)) as unknown as Array<{
    platform: string;
    handle: string | null;
    followers: number;
    posts: number;
    total_views: number;
    pulled_at: Date;
  }>;

  // One row per (platform, day) — pick the max pulled_at per day.
  const series = (await db.execute(sql`
    select
      to_char(pulled_at, 'YYYY-MM-DD') as day,
      platform,
      max(followers)::int as followers
    from channel_metrics
    where pulled_at >= ${tsParam(since)}
    group by day, platform
    order by day
  `)) as unknown as Array<{ day: string; platform: string; followers: number }>;

  const buckets = emptyDayBuckets(windowDays);
  for (const r of series) {
    const point = buckets.get(r.day);
    if (point) point[r.platform] = Number(r.followers);
  }

  return {
    configured: true,
    latest: latest.map((r) => ({
      platform: r.platform,
      handle: r.handle,
      followers: Number(r.followers),
      posts: Number(r.posts),
      totalViews: Number(r.total_views),
      pulledAt: r.pulled_at,
    })),
    followersOverTime: Array.from(buckets.values()),
  };
}

/* ────────────────────────────────────────────────────────────────────
 * USER FEEDBACK
 * ────────────────────────────────────────────────────────────────── */

export type FeedbackView = {
  configured: boolean;
  total: number;
  totalWindow: number;
  windowDays: number;
  byCategory: Array<{ category: string; n: number }>;
  perDay: ChartPoint[];
  rows: Array<{
    id: string;
    email: string;
    category: string;
    locale: string | null;
    message: string;
    sourcePath: string | null;
    createdAt: Date;
  }>;
};

export async function feedbackView(
  opts?: { windowDays?: number; limit?: number; category?: string },
): Promise<FeedbackView> {
  const windowDays = opts?.windowDays ?? 30;
  const limit = opts?.limit ?? 200;
  const empty: FeedbackView = {
    configured: false,
    total: 0,
    totalWindow: 0,
    windowDays,
    byCategory: [],
    perDay: [],
    rows: [],
  };
  if (!process.env.DATABASE_URL) return empty;

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [totals] = (await db.execute(sql`
    select
      (select count(*) from user_feedback) as total_all,
      (select count(*) from user_feedback where created_at >= ${tsParam(since)}) as total_window
  `)) as unknown as Array<{ total_all: number; total_window: number }>;

  const byCategory = (await db.execute(sql`
    select category, count(*)::int as n
      from user_feedback
     where created_at >= ${tsParam(since)}
     group by category
     order by n desc
  `)) as unknown as Array<{ category: string; n: number }>;

  const perDayRows = (await db.execute(sql`
    select to_char(created_at, 'YYYY-MM-DD') as day, count(*)::int as n
      from user_feedback
     where created_at >= ${tsParam(since)}
     group by day
     order by day
  `)) as unknown as Array<{ day: string; n: number }>;

  const buckets = emptyDayBuckets(windowDays);
  for (const r of perDayRows) {
    const point = buckets.get(r.day);
    if (point) point.submissions = Number(r.n);
  }
  // Default zero where no rows that day.
  for (const point of buckets.values()) {
    if (point.submissions === undefined) point.submissions = 0;
  }

  const where = opts?.category
    ? and(gte(userFeedback.createdAt, since), eq(userFeedback.category, opts.category as "improvement" | "praise" | "bug" | "other"))
    : gte(userFeedback.createdAt, since);

  const rows = await db
    .select()
    .from(userFeedback)
    .where(where)
    .orderBy(desc(userFeedback.createdAt))
    .limit(limit);

  return {
    configured: true,
    total: Number(totals?.total_all ?? 0),
    totalWindow: Number(totals?.total_window ?? 0),
    windowDays,
    byCategory: byCategory.map((b) => ({ category: b.category, n: Number(b.n) })),
    perDay: Array.from(buckets.values()),
    rows: rows.map((r) => ({
      id: r.id,
      email: r.email,
      category: r.category,
      locale: r.locale,
      message: r.message,
      sourcePath: r.sourcePath,
      createdAt: r.createdAt,
    })),
  };
}

/* ────────────────────────────────────────────────────────────────────
 * SUBSCRIBERS (Buttondown list + audit-log growth)
 *
 * Source-of-truth list lives in Buttondown; we pull the first page +
 * count via API. The growth chart comes from audit_log entries — every
 * subscribe call records {action: "email_subscribe"} with a timestamp
 * (and a hashed fingerprint, never the raw email), which is enough
 * to chart daily growth without ever persisting PII server-side.
 * ────────────────────────────────────────────────────────────────── */

export type SubscriberView = {
  configured: boolean;
  buttondownConfigured: boolean;
  totalCount: number | null;
  recent: Array<{ email: string; createdAt: Date; tags: string[] }>;
  growthPerDay: ChartPoint[];
  windowDays: number;
};

export async function subscriberView(windowDays = 90): Promise<SubscriberView> {
  const out: SubscriberView = {
    configured: !!process.env.DATABASE_URL,
    buttondownConfigured: !!process.env.BUTTONDOWN_API_KEY,
    totalCount: null,
    recent: [],
    growthPerDay: [],
    windowDays,
  };

  // Growth from audit_log (always available when DB is configured).
  if (process.env.DATABASE_URL) {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const perDay = (await db.execute(sql`
      select to_char(ts, 'YYYY-MM-DD') as day, count(*)::int as n
        from audit_log
       where action = 'email_subscribe'
         and ts >= ${tsParam(since)}
       group by day
       order by day
    `)) as unknown as Array<{ day: string; n: number }>;
    const buckets = emptyDayBuckets(windowDays);
    for (const r of perDay) {
      const point = buckets.get(r.day);
      if (point) point.subscribes = Number(r.n);
    }
    for (const point of buckets.values()) {
      if (point.subscribes === undefined) point.subscribes = 0;
    }
    out.growthPerDay = Array.from(buckets.values());
  }

  // Live list from Buttondown.
  if (process.env.BUTTONDOWN_API_KEY) {
    try {
      const res = await fetch(
        "https://api.buttondown.email/v1/subscribers?ordering=-creation_date",
        {
          headers: {
            Authorization: `Token ${process.env.BUTTONDOWN_API_KEY}`,
            "Content-Type": "application/json",
          },
          // Buttondown's free tier is rate-limited; cache for 5 min.
          next: { revalidate: 300 },
        },
      );
      if (res.ok) {
        const j = (await res.json()) as {
          count?: number;
          results?: Array<{
            email_address?: string;
            creation_date?: string;
            tags?: string[];
          }>;
        };
        out.totalCount = j.count ?? null;
        out.recent = (j.results ?? []).slice(0, 100).map((s) => ({
          email: s.email_address ?? "",
          createdAt: s.creation_date ? new Date(s.creation_date) : new Date(0),
          tags: s.tags ?? [],
        }));
      }
    } catch {
      // Buttondown unreachable — leave totalCount null; the page will
      // render a "Buttondown unreachable" notice rather than crash.
    }
  }

  return out;
}

/** CSV-escape a single field. */
export function csvEscape(s: unknown): string {
  const v = s === null || s === undefined ? "" : String(s);
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Turn rows of {key:value} into a CSV string with the given header order. */
export function rowsToCsv<T extends Record<string, unknown>>(
  rows: T[],
  headers: Array<keyof T & string>,
): string {
  const head = headers.map(csvEscape).join(",");
  const body = rows
    .map((r) => headers.map((h) => csvEscape(r[h])).join(","))
    .join("\n");
  return `${head}\n${body}\n`;
}
