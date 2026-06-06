/**
 * Daily content-engine core — shared by the Vercel cron route
 * (app/api/cron/daily-generate/route.ts) and the GitHub Actions script
 * (scripts/daily-generate.ts).
 *
 * Keeping the brief-mix, dedup window, queue-full guard, parallel generation,
 * and audit emission in ONE place means the two entrypoints can never drift.
 * The route owns auth + the HTTP envelope; this module owns the work.
 *
 * Nothing here auto-publishes — every draft lands at status `script_draft`
 * for human review. See ADR/RUNBOOK for the generation contract.
 */

import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts, resources, resourceTags, tags } from "@/lib/db/schema";
import { generateScript, ScriptRefusal } from "@/lib/social/script-generator";
import {
  CONTENT_BRIEFS,
  orderedBriefs,
  type ContentBrief,
} from "@/lib/social/content-briefs";
import { retrieveEvidence } from "@/lib/social/grounding";
import { recordAudit } from "@/lib/observability/audit";

export type DailyGenerateSummary = {
  attempted: number;
  created: number;
  refused: number;
  failed: number;
  briefIds: string[];
  errors: Array<{ briefId: string; reason: string }>;
};

export type DailyGenerateResult =
  | { skipped: true; reason: "queue_full"; stuckCount: number; threshold: number }
  | ({ skipped: false; stuckCount: number } & DailyGenerateSummary);

type Job = {
  brief: ContentBrief;
  language: "en" | "hi" | "hinglish";
  style: "typography" | "stock" | "carousel" | "long_form_essay";
  durationSeconds: number;
  kind: string;
};

/**
 * Run one daily generation pass. `actor` distinguishes the caller in audit
 * rows ("cron:vercel" vs "cron:gh-actions"). Caller is responsible for the
 * auth gate and for ensuring DATABASE_URL is set.
 *
 * `concurrency` controls how many generations run at once:
 *   - Vercel route: defaults to ALL-parallel (collapses wall time to fit the
 *     60s Hobby function cap — at the cost of bursting the LLM's tokens-per-
 *     minute limit, which is why some drafts get rate-limited).
 *   - GitHub Actions: pass 1 (sequential). With a 20-minute budget there is no
 *     timeout pressure, and serialising the calls keeps us under Groq's TPM
 *     limit so all jobs land instead of 3-4 dying on 429s.
 */
export async function runDailyGenerate(opts?: {
  actor?: string;
  now?: Date;
  concurrency?: number;
  /** Delay between sequential job starts (ms). Spreads token usage across
   *  minute windows so we stay under the LLM's TPM limit. Ignored when
   *  concurrency > 1. */
  delayMs?: number;
}): Promise<DailyGenerateResult> {
  const actor = opts?.actor ?? "cron:vercel";
  const now = opts?.now ?? new Date();

  // Refuse to spam the queue if too many drafts are already piled up
  // unreviewed. Operators clear the queue before we generate more.
  const stuck = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contentDrafts)
    .where(
      sql`${contentDrafts.status} = 'script_draft' AND ${contentDrafts.createdAt} > now() - interval '7 days'`,
    );
  const stuckCount = stuck[0]?.n ?? 0;
  const MAX_STUCK = Number(process.env.DAILY_GENERATE_MAX_STUCK ?? 12);
  if (stuckCount >= MAX_STUCK) {
    void recordAudit({
      actor,
      action: "daily_generate_skipped_queue_full",
      meta: { stuckCount, threshold: MAX_STUCK },
    });
    return { skipped: true, reason: "queue_full", stuckCount, threshold: MAX_STUCK };
  }

  // Find briefs we've used in the last 14 days; we'll prefer fresh ones.
  const recent = await db
    .select({ brief: contentDrafts.brief })
    .from(contentDrafts)
    .where(gte(contentDrafts.createdAt, sql`now() - interval '14 days'`));
  const recentlyUsedIds = new Set<string>();
  for (const r of recent) {
    const matched = CONTENT_BRIEFS.find((b) => r.brief.startsWith(b.brief.slice(0, 60)));
    if (matched) recentlyUsedIds.add(matched.id);
  }

  // Default mix per day: 3 short-form reels (30s each) + 2 long-form
  // essays (120s each). Override via env without code changes.
  const shortFormCount = Number(process.env.DAILY_GENERATE_SHORT_FORM ?? 3);
  const longFormCount = Number(process.env.DAILY_GENERATE_LONG_FORM ?? 2);

  const ordered = orderedBriefs({ date: now, recentlyUsedIds });
  const picks = {
    shortForm: ordered.shortForm.slice(0, shortFormCount),
    longForm: ordered.longForm.slice(0, longFormCount),
  };
  // Backups the top-up phase draws on when a pick fails or is refused, so
  // the day still lands the full short + long quota.
  const backupShort = ordered.shortForm.slice(shortFormCount);
  const backupLong = ordered.longForm.slice(longFormCount);

  // Up-front audit so a mid-run timeout still leaves evidence the run fired.
  await recordAudit({
    actor,
    action: "daily_generate_started",
    meta: {
      shortFormPicks: picks.shortForm.length,
      longFormPicks: picks.longForm.length,
      stuckCount,
      briefIds: [...picks.shortForm.map((b) => b.id), ...picks.longForm.map((b) => b.id)],
    },
  });

  const longFormSeconds = Number(process.env.DAILY_GENERATE_LONG_FORM_SECONDS ?? 120);
  const shortFormSeconds = Number(process.env.DAILY_GENERATE_SHORT_FORM_SECONDS ?? 30);

  // Job factories so the top-up phase can mint replacement jobs that match
  // the shape (style + language rotation) of the originals. Long-form goes
  // FIRST so it wins the event loop if a partial timeout still happens on a
  // constrained runtime — better to lose a reel than the essay.
  const makeLongJob = (brief: ContentBrief): Job => ({
    brief,
    language: "en",
    style: "long_form_essay",
    durationSeconds: longFormSeconds,
    kind: "long_form",
  });
  const makeShortJob = (brief: ContentBrief, i: number): Job => ({
    brief,
    language: (["en", "hinglish"] as const)[i % 2],
    style: i % 2 === 0 ? "typography" : "stock",
    durationSeconds: shortFormSeconds,
    kind: "reel",
  });

  const jobs: Job[] = [
    ...picks.longForm.map((brief) => makeLongJob(brief)),
    ...picks.shortForm.map((brief, i) => makeShortJob(brief, i)),
  ];

  const concurrency = Math.max(1, opts?.concurrency ?? jobs.length);
  const delayMs = Math.max(0, opts?.delayMs ?? 0);

  const summary: DailyGenerateSummary = {
    attempted: 0,
    created: 0,
    refused: 0,
    failed: 0,
    briefIds: [],
    errors: [],
  };
  // Per-kind tally drives the top-up: we replace like with like so the daily
  // mix (short + long) is preserved, not just the total count.
  let createdLong = 0;
  let createdShort = 0;

  const runAndTally = async (batch: Job[]): Promise<void> => {
    summary.attempted += batch.length;
    const settled = await mapSettled(batch, concurrency, (j) => generateOne(j, actor), delayMs);
    for (let i = 0; i < settled.length; i++) {
      const job = batch[i];
      const r = settled[i];
      if (r.status === "fulfilled") {
        const v = r.value;
        if (v.outcome === "created") {
          summary.created += 1;
          summary.briefIds.push(job.brief.id);
          if (job.kind === "long_form") createdLong += 1;
          else createdShort += 1;
        } else if (v.outcome === "refused") {
          summary.refused += 1;
          summary.errors.push({ briefId: job.brief.id, reason: `refusal:${v.reason}` });
        } else {
          summary.failed += 1;
          summary.errors.push({ briefId: job.brief.id, reason: v.reason });
        }
      } else {
        summary.failed += 1;
        summary.errors.push({
          briefId: job.brief.id,
          reason: String((r.reason as Error)?.message ?? r.reason).slice(0, 200),
        });
      }
    }
  };

  // Phase 1: today's picks.
  await runAndTally(jobs);

  // Phase 2: top-up. Replace any failed/refused pick with a fresh backup
  // brief of the SAME kind until we hit the per-kind quota — or run out of
  // budget/backups. Bounded by DAILY_GENERATE_TOPUP_MAX so a pathological
  // streak of refusals can never burn unlimited tokens or wall time.
  const maxTopup = Math.max(0, Number(process.env.DAILY_GENERATE_TOPUP_MAX ?? 4));
  const longQueue = [...backupLong];
  const shortQueue = [...backupShort];
  let topupUsed = 0;
  let shortIdx = picks.shortForm.length;
  while (topupUsed < maxTopup) {
    const needLong = Math.max(0, longFormCount - createdLong);
    const needShort = Math.max(0, shortFormCount - createdShort);
    if (needLong === 0 && needShort === 0) break;

    const batch: Job[] = [];
    for (let i = 0; i < needLong && longQueue.length > 0 && topupUsed + batch.length < maxTopup; i++) {
      batch.push(makeLongJob(longQueue.shift()!));
    }
    for (let i = 0; i < needShort && shortQueue.length > 0 && topupUsed + batch.length < maxTopup; i++) {
      batch.push(makeShortJob(shortQueue.shift()!, shortIdx++));
    }
    if (batch.length === 0) break; // backups exhausted
    topupUsed += batch.length;
    await runAndTally(batch);
  }

  await recordAudit({
    actor,
    action: "daily_generate_cron",
    meta: {
      attempted: summary.attempted,
      created: summary.created,
      refused: summary.refused,
      failed: summary.failed,
      topupUsed,
      briefIds: summary.briefIds,
      errors: summary.errors,
    },
  });

  return { skipped: false, stuckCount, ...summary };
}

/**
 * Like `Promise.allSettled(items.map(fn))` but with a concurrency cap and
 * order-preserving results. A pool of `limit` workers drains the queue.
 */
async function mapSettled<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  delayMs = 0,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    let didOne = false;
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      // Space sequential jobs apart so token usage straddles minute windows.
      if (didOne && delayMs > 0) await sleep(delayMs);
      didOne = true;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason } as PromiseRejectedResult;
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GenerateOutcome =
  | { outcome: "created" }
  | { outcome: "refused"; reason: string }
  | { outcome: "failed"; reason: string };

async function generateOne(job: Job, actor: string): Promise<GenerateOutcome> {
  const { brief, language, style, durationSeconds, kind } = job;

  let resource:
    | { title: string; authors?: string[]; year?: number; sourceName: string; url: string }
    | undefined;
  if (brief.citationTopic) {
    const r = await db
      .select({
        title: resources.title,
        authors: resources.authors,
        publishedAt: resources.publishedAt,
        externalUrl: resources.externalUrl,
      })
      .from(resources)
      .innerJoin(resourceTags, eq(resourceTags.resourceId, resources.id))
      .innerJoin(tags, eq(tags.id, resourceTags.tagId))
      .where(
        and(
          eq(resources.isPublished, true),
          eq(tags.category, "topic"),
          eq(tags.name, brief.citationTopic),
        ),
      )
      .orderBy(sql`${resources.publishedAt} DESC NULLS LAST`)
      .limit(1);
    if (r[0]) {
      resource = {
        title: r[0].title,
        authors: (r[0].authors as string[]) ?? [],
        year: r[0].publishedAt ? new Date(r[0].publishedAt).getFullYear() : undefined,
        sourceName: "Intimacy & Sex Therapy Library",
        url: r[0].externalUrl,
      };
    }
  }

  // Retrieve grounding evidence from the validated corpus. Soft policy:
  // empty result -> generate ungrounded but flag the draft low-grounding.
  const grounding = await retrieveEvidence({
    briefText: brief.brief,
    topicSlug: brief.topicSlug,
  });

  try {
    const script = await generateScript({
      brief: brief.brief,
      language,
      durationSeconds,
      style,
      resource,
      evidence: { chunks: grounding.chunks, citation: grounding.citation },
    });

    await db.insert(contentDrafts).values({
      kind,
      language,
      brief: brief.brief,
      scriptMd: serialiseScriptToMd(script, style),
      status: "script_draft",
      grounding: {
        chunkIds: grounding.chunks.map((c) => c.chunkId),
        sources: grounding.sources.map((s) => ({ title: s.title, url: s.url, year: s.year })),
        score: grounding.score,
        lowGrounding: grounding.lowGrounding,
      },
    });

    await recordAudit({
      actor,
      action: "daily_generate_item",
      meta: { briefId: brief.id, kind, language, outcome: "created" },
    });
    return { outcome: "created" };
  } catch (e) {
    if (e instanceof ScriptRefusal) {
      await recordAudit({
        actor,
        action: "daily_generate_item",
        meta: { briefId: brief.id, kind, language, outcome: "refused", reason: e.reason },
      });
      return { outcome: "refused", reason: e.reason };
    }
    const msg = String((e as Error).message).slice(0, 200);
    await recordAudit({
      actor,
      action: "daily_generate_item",
      meta: { briefId: brief.id, kind, language, outcome: "failed", reason: msg },
    });
    return { outcome: "failed", reason: msg };
  }
}

function serialiseScriptToMd(
  s: Awaited<ReturnType<typeof generateScript>>,
  style: string,
): string {
  return [
    `# Style\n${style}`,
    `# Hook\n${s.hook}`,
    `# Body`,
    s.body.map((b, i) => `${i + 1}. (${b.seconds}s) ${b.text}`).join("\n"),
    `# CTA\n${s.cta}`,
    `# Caption\n${s.caption}`,
    `# Hashtags\n${s.hashtags.join(" ")}`,
    s.citationLine ? `# Citation\n${s.citationLine}` : "",
    `# Duration\n${s.durationSeconds}s`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
