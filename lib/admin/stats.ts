/**
 * Operational metrics for the admin dashboard.
 *
 * These are the queries that answer "what needs my attention right now?"
 * Every function fails closed — if DATABASE_URL is unset or a query throws,
 * we return zeros / empty arrays so the dashboard renders without
 * exploding. The dashboard surfaces a banner when DB is down, so missing
 * counts are not silently misleading.
 *
 * No prompt or message content is read by anything in this module.
 */

import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  contentDrafts,
  crisisEvents,
  evalRuns,
  postMetrics,
  resources,
  auditLog,
} from "@/lib/db/schema";

/** "Today" anchored to UTC; week / month windows derived from it. */
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

export type DraftStateCounts = Record<string, number>;

export async function draftStateCounts(): Promise<DraftStateCounts> {
  if (!process.env.DATABASE_URL) return {};
  try {
    const rows = await db
      .select({
        status: contentDrafts.status,
        n: sql<number>`count(*)::int`,
      })
      .from(contentDrafts)
      .groupBy(contentDrafts.status);
    const out: DraftStateCounts = {};
    for (const r of rows) out[r.status] = Number(r.n);
    return out;
  } catch {
    return {};
  }
}

export type ResourceStats = {
  published: number;
  unpublished: number;
  byLicense: Array<{ license: string; n: number }>;
  byKind: Array<{ kind: string; n: number }>;
};

export async function resourceStats(): Promise<ResourceStats> {
  if (!process.env.DATABASE_URL) {
    return { published: 0, unpublished: 0, byLicense: [], byKind: [] };
  }
  try {
    const [pubRow] = await db
      .select({
        published: sql<number>`count(*) filter (where ${resources.isPublished})::int`,
        unpublished: sql<number>`count(*) filter (where not ${resources.isPublished})::int`,
      })
      .from(resources);

    const byLicense = await db
      .select({
        license: resources.license,
        n: sql<number>`count(*)::int`,
      })
      .from(resources)
      .groupBy(resources.license)
      .orderBy(sql`count(*) desc`);

    const byKind = await db
      .select({
        kind: resources.kind,
        n: sql<number>`count(*)::int`,
      })
      .from(resources)
      .groupBy(resources.kind)
      .orderBy(sql`count(*) desc`);

    return {
      published: Number(pubRow?.published ?? 0),
      unpublished: Number(pubRow?.unpublished ?? 0),
      byLicense: byLicense.map((r) => ({ license: String(r.license), n: Number(r.n) })),
      byKind: byKind.map((r) => ({ kind: String(r.kind), n: Number(r.n) })),
    };
  } catch {
    return { published: 0, unpublished: 0, byLicense: [], byKind: [] };
  }
}

export type CrisisCountByCategory = {
  windowDays: number;
  total: number;
  bySurface: { chat: number; companion: number };
  byCategory: Array<{ category: string; n: number }>;
};

export async function crisisCounts(windowDays = 7): Promise<CrisisCountByCategory> {
  const empty: CrisisCountByCategory = {
    windowDays,
    total: 0,
    bySurface: { chat: 0, companion: 0 },
    byCategory: [],
  };
  if (!process.env.DATABASE_URL) return empty;
  try {
    const since = daysAgo(windowDays);

    const [totalRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(crisisEvents)
      .where(gte(crisisEvents.ts, since));

    const surfaceRows = await db
      .select({
        surface: crisisEvents.surface,
        n: sql<number>`count(*)::int`,
      })
      .from(crisisEvents)
      .where(gte(crisisEvents.ts, since))
      .groupBy(crisisEvents.surface);

    const catRows = await db
      .select({
        category: crisisEvents.category,
        n: sql<number>`count(*)::int`,
      })
      .from(crisisEvents)
      .where(gte(crisisEvents.ts, since))
      .groupBy(crisisEvents.category)
      .orderBy(sql`count(*) desc`);

    const bySurface = { chat: 0, companion: 0 };
    for (const r of surfaceRows) {
      if (r.surface === "chat" || r.surface === "companion") {
        bySurface[r.surface] = Number(r.n);
      }
    }

    return {
      windowDays,
      total: Number(totalRow?.n ?? 0),
      bySurface,
      byCategory: catRows.map((r) => ({ category: String(r.category), n: Number(r.n) })),
    };
  } catch {
    return empty;
  }
}

export type EvalTrend = Array<{
  ranAt: Date;
  modelId: string;
  refusalRate: number; // 0..1
  citationFaithfulness: number; // 0..1
  empathy: number; // 0..5
}>;

export async function evalTrend(limit = 5): Promise<EvalTrend> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = await db
      .select()
      .from(evalRuns)
      .orderBy(desc(evalRuns.ranAt))
      .limit(limit);
    return rows.map((r) => ({
      ranAt: r.ranAt,
      modelId: r.modelId,
      refusalRate: r.refusalRate / 10000,
      citationFaithfulness: r.citationFaithfulness / 10000,
      empathy: r.empathyScore / 100,
    }));
  } catch {
    return [];
  }
}

export type RecentAudit = Array<{
  ts: Date;
  action: string;
}>;

export async function recentAudit(limit = 12): Promise<RecentAudit> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = await db
      .select({ ts: auditLog.ts, action: auditLog.action })
      .from(auditLog)
      .orderBy(desc(auditLog.ts))
      .limit(limit);
    return rows.map((r) => ({ ts: r.ts, action: r.action }));
  } catch {
    return [];
  }
}

export type DraftQueueSlice = {
  id: string;
  brief: string;
  language: string;
  kind: string;
  status: string;
  createdAt: Date;
};

/** Drafts grouped by the most useful actionable buckets. */
export async function actionableDrafts(): Promise<{
  awaitingClinician: DraftQueueSlice[];
  awaitingEditor: DraftQueueSlice[];
  readyToPublish: DraftQueueSlice[];
}> {
  if (!process.env.DATABASE_URL) {
    return { awaitingClinician: [], awaitingEditor: [], readyToPublish: [] };
  }
  try {
    const slice = (statuses: string[]) =>
      db
        .select({
          id: contentDrafts.id,
          brief: contentDrafts.brief,
          language: contentDrafts.language,
          kind: contentDrafts.kind,
          status: contentDrafts.status,
          createdAt: contentDrafts.createdAt,
        })
        .from(contentDrafts)
        .where(inArray(contentDrafts.status, statuses as never[]))
        .orderBy(desc(contentDrafts.createdAt))
        .limit(8);

    const [awaitingClinician, awaitingEditor, readyToPublish] = await Promise.all([
      slice(["script_draft"]),
      slice(["clinician_reviewed", "rendered"]),
      slice(["editor_reviewed"]),
    ]);

    return {
      awaitingClinician: awaitingClinician.map(toQueueSlice),
      awaitingEditor: awaitingEditor.map(toQueueSlice),
      readyToPublish: readyToPublish.map(toQueueSlice),
    };
  } catch {
    return { awaitingClinician: [], awaitingEditor: [], readyToPublish: [] };
  }
}

function toQueueSlice(r: {
  id: string;
  brief: string;
  language: string;
  kind: string;
  status: string;
  createdAt: Date;
}): DraftQueueSlice {
  return { ...r };
}

// ---------------------------------------------------------------------------
// Phase 14: post-metrics + takedown alerts
// ---------------------------------------------------------------------------

export type RecentPost = {
  draftId: string;
  brief: string;
  status: string;
  postedAt: Date;
  platforms: string[];
  totals: { views: number; likes: number; comments: number; saves: number };
  perPlatform: Array<{
    platform: string;
    views: number;
    likes: number;
    comments: number;
    saves: number;
    pulledAt: Date | null;
  }>;
};

/**
 * Posts from the last N days with their LATEST metrics row per platform.
 * Falls back to zeros for posts that haven't been polled yet.
 */
export async function recentPosts(opts?: { windowDays?: number; limit?: number }): Promise<RecentPost[]> {
  if (!process.env.DATABASE_URL) return [];
  const windowDays = opts?.windowDays ?? 30;
  const limit = opts?.limit ?? 8;
  try {
    const since = daysAgo(windowDays);
    const drafts = await db
      .select({
        id: contentDrafts.id,
        brief: contentDrafts.brief,
        status: contentDrafts.status,
        postedAt: contentDrafts.postedAt,
        platformPostIds: contentDrafts.platformPostIds,
      })
      .from(contentDrafts)
      .where(
        and(
          inArray(contentDrafts.status, ["posted", "taken_down"] as never[]),
          gte(contentDrafts.postedAt, since),
          isNotNull(contentDrafts.postedAt),
        ),
      )
      .orderBy(desc(contentDrafts.postedAt))
      .limit(limit);

    if (drafts.length === 0) return [];

    // Latest metrics row per (draft, platform) — DISTINCT ON keeps the most
    // recently pulled record while letting Postgres do the heavy lifting.
    const ids = drafts.map((d) => d.id);
    const metricsRows = (await db.execute(sql`
      select distinct on (draft_id, platform)
             draft_id, platform, views, likes, comments, saves, link_clicks, pulled_at
        from post_metrics
       where draft_id = any(${ids})
       order by draft_id, platform, pulled_at desc
    `)) as unknown as Array<{
      draft_id: string;
      platform: string;
      views: number;
      likes: number;
      comments: number;
      saves: number;
      link_clicks: number;
      pulled_at: Date;
    }>;

    return drafts.map((d) => {
      const ours = metricsRows.filter((m) => m.draft_id === d.id);
      const platforms = Object.keys((d.platformPostIds as Record<string, string>) ?? {});
      const totals = ours.reduce(
        (acc, m) => ({
          views: acc.views + Number(m.views ?? 0),
          likes: acc.likes + Number(m.likes ?? 0),
          comments: acc.comments + Number(m.comments ?? 0),
          saves: acc.saves + Number(m.saves ?? 0),
        }),
        { views: 0, likes: 0, comments: 0, saves: 0 },
      );
      return {
        draftId: d.id,
        brief: d.brief,
        status: d.status,
        postedAt: d.postedAt as Date,
        platforms,
        totals,
        perPlatform: platforms.map((platform) => {
          const m = ours.find((row) => row.platform === platform);
          return {
            platform,
            views: Number(m?.views ?? 0),
            likes: Number(m?.likes ?? 0),
            comments: Number(m?.comments ?? 0),
            saves: Number(m?.saves ?? 0),
            pulledAt: m?.pulled_at ?? null,
          };
        }),
      };
    });
  } catch {
    return [];
  }
}

export type ActiveTakedown = {
  draftId: string;
  brief: string;
  detectedAt: Date;
  platform: string;
  detail: string;
};

/**
 * The most recent takedown event from each `taken_down` draft. Surfaces in
 * a coral alert at the top of /admin so an operator notices quickly.
 */
export async function activeTakedowns(opts?: { limit?: number; windowDays?: number }): Promise<ActiveTakedown[]> {
  if (!process.env.DATABASE_URL) return [];
  const limit = opts?.limit ?? 10;
  const windowDays = opts?.windowDays ?? 60;
  try {
    const since = daysAgo(windowDays);
    const rows = await db
      .select({
        id: contentDrafts.id,
        brief: contentDrafts.brief,
        takedownEvents: contentDrafts.takedownEvents,
        postedAt: contentDrafts.postedAt,
      })
      .from(contentDrafts)
      .where(
        and(
          eq(contentDrafts.status, "taken_down"),
          gte(contentDrafts.postedAt, since),
        ),
      )
      .orderBy(desc(contentDrafts.postedAt))
      .limit(limit);

    return rows
      .map((r) => {
        const events = (r.takedownEvents as Array<Record<string, unknown>> | null) ?? [];
        const last = events[events.length - 1] ?? {};
        const detectedAt = last.detectedAt
          ? new Date(String(last.detectedAt))
          : (r.postedAt as Date) ?? new Date();
        return {
          draftId: r.id,
          brief: r.brief,
          detectedAt,
          platform: String((last.platform as string) ?? "unknown"),
          detail: String((last.detail as string) ?? ""),
        };
      })
      .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
  } catch {
    return [];
  }
}

// Re-exports to keep the dashboard's import block compact.
export { eq, and };
// Suppress unused import warning — `postMetrics` is referenced from raw SQL.
void postMetrics;
