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
  pickBriefsForToday,
  type ContentBrief,
} from "@/lib/social/content-briefs";
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
 */
export async function runDailyGenerate(opts?: {
  actor?: string;
  now?: Date;
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

  const picks = pickBriefsForToday({
    date: now,
    shortFormCount,
    longFormCount,
    recentlyUsedIds,
  });

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

  // Long-form goes FIRST so it wins the event loop if a partial timeout still
  // happens on a constrained runtime — better to lose a reel than the essay.
  const jobs: Job[] = [
    ...picks.longForm.map<Job>((brief) => ({
      brief,
      language: "en",
      style: "long_form_essay",
      durationSeconds: longFormSeconds,
      kind: "long_form",
    })),
    ...picks.shortForm.map<Job>((brief, i) => ({
      brief,
      language: (["en", "hinglish"] as const)[i % 2],
      style: i % 2 === 0 ? "typography" : "stock",
      durationSeconds: shortFormSeconds,
      kind: "reel",
    })),
  ];

  const settled = await Promise.allSettled(jobs.map((j) => generateOne(j, actor)));

  const summary: DailyGenerateSummary = {
    attempted: jobs.length,
    created: 0,
    refused: 0,
    failed: 0,
    briefIds: [],
    errors: [],
  };
  for (let i = 0; i < settled.length; i++) {
    const job = jobs[i];
    const r = settled[i];
    if (r.status === "fulfilled") {
      const v = r.value;
      if (v.outcome === "created") {
        summary.created += 1;
        summary.briefIds.push(job.brief.id);
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

  await recordAudit({
    actor,
    action: "daily_generate_cron",
    meta: {
      attempted: summary.attempted,
      created: summary.created,
      refused: summary.refused,
      failed: summary.failed,
      briefIds: summary.briefIds,
      errors: summary.errors,
    },
  });

  return { skipped: false, stuckCount, ...summary };
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

  try {
    const script = await generateScript({
      brief: brief.brief,
      language,
      durationSeconds,
      style,
      resource,
    });

    await db.insert(contentDrafts).values({
      kind,
      language,
      brief: brief.brief,
      scriptMd: serialiseScriptToMd(script, style),
      status: "script_draft",
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
