/**
 * Daily content-engine cron.
 *
 * Schedule: 05:00 IST = 23:30 UTC (Vercel's hobby plan only allows
 * once-daily crons on free; we live with the 30-minute drift.) The
 * runner picks a curated set of briefs and creates `script_draft`
 * entries for each. NOTHING auto-publishes — every draft lands in
 * the queue for human review.
 *
 * What it generates per run (configurable via env):
 *   - 3 short-form scripts → 30s reels for IG + YT Shorts
 *     (rotates en / hinglish across the three picks)
 *   - 2 long-form scripts → 2-minute YouTube essays (always EN)
 *
 * Concurrency: all five generations run in PARALLEL via
 * `Promise.allSettled`. Earlier versions ran them sequentially with
 * the long-form last; that wedged the long-form against Vercel's
 * effective 60s function-timeout cap because the reels burned the
 * first ~30-50s. Per the audit-log forensic on 2026-05-28, the
 * function consistently created the 2 reels and was killed before
 * the long-form `db.insert` ran (no `daily_generate_cron` audit row
 * for any 5/26 or 5/27 run, even though both runs persisted reels).
 * Running in parallel collapses wall time to max(reel, reel, ...,
 * essay) which fits comfortably inside 60s on Groq llama-3.3-70b
 * (each reel ≈ 1-3s, each essay ≈ 15-30s with one budget retry).
 *
 * Observability: emits a `daily_generate_started` audit at the top
 * AND a per-item `daily_generate_item` audit after each generation
 * resolves, so a mid-run timeout still leaves a forensic trail.
 *
 * Idempotency: the cron looks at the last 14 days of drafts to avoid
 * picking briefs we've already used; if multiple cron retries hit the
 * same window the deterministic seeding makes them safe.
 *
 * Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}`. Same
 * gate as the existing post-metrics cron.
 */

import { NextResponse } from "next/server";
import { gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts, resources, resourceTags, tags } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generateScript, ScriptRefusal } from "@/lib/social/script-generator";
import { CONTENT_BRIEFS, pickBriefsForToday, type ContentBrief } from "@/lib/social/content-briefs";
import { recordAudit } from "@/lib/observability/audit";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type GenerateSummary = {
  attempted: number;
  created: number;
  refused: number;
  failed: number;
  briefIds: string[];
  errors: Array<{ briefId: string; reason: string }>;
};

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}

async function handle(req: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "cron_disabled", detail: "Set CRON_SECRET to enable the daily generator." },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    log.warn("cron_unauthorized", { surface: "daily_generate" });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  // Refuse to spam the queue if too many drafts are already piled up
  // unreviewed. Operators clear the queue before we generate more.
  const stuck = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contentDrafts)
    .where(sql`${contentDrafts.status} = 'script_draft' AND ${contentDrafts.createdAt} > now() - interval '7 days'`);
  const stuckCount = stuck[0]?.n ?? 0;
  const MAX_STUCK = Number(process.env.DAILY_GENERATE_MAX_STUCK ?? 12);
  if (stuckCount >= MAX_STUCK) {
    void recordAudit({
      actor: "cron:vercel",
      action: "daily_generate_skipped_queue_full",
      meta: { stuckCount, threshold: MAX_STUCK },
    });
    return NextResponse.json(
      {
        skipped: true,
        reason: "queue_full",
        stuckCount,
        threshold: MAX_STUCK,
      },
      { status: 200 },
    );
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
    date: new Date(),
    shortFormCount,
    longFormCount,
    recentlyUsedIds,
  });

  // Up-front audit so a mid-run timeout still leaves evidence the cron
  // fired. We can correlate this to the per-item audits emitted from
  // each `generateOne` to figure out which step Vercel killed.
  await recordAudit({
    actor: "cron:vercel",
    action: "daily_generate_started",
    meta: {
      shortFormPicks: picks.shortForm.length,
      longFormPicks: picks.longForm.length,
      stuckCount,
      briefIds: [...picks.shortForm.map((b) => b.id), ...picks.longForm.map((b) => b.id)],
    },
  });

  // Build the full job list up-front, then dispatch in PARALLEL.
  // Sequential awaiting (older code) wedged the long-form against
  // Vercel's effective 60s timeout — see file header.
  type Job = {
    brief: ContentBrief;
    language: "en" | "hi" | "hinglish";
    style: "typography" | "stock" | "carousel" | "long_form_essay";
    durationSeconds: number;
    kind: string;
  };
  // Long-form essays target 2 minutes (~240 words at our 120 wpm narrator
  // pace — Jenny @ -10% rate). Tightened down from 240s on 2026-05-27
  // after the first batch of 4-minute essays came back as 5-8 word
  // chapter headlines: the LLM was treating chapters as bullet points
  // instead of essay paragraphs and shipping 30s renders for a "4-minute"
  // brief. The new STYLE_GUIDANCE + word-count guard in
  // script-generator.ts enforces the target — if the LLM still
  // underwrites, generateScript throws ScriptRefusal("script_too_short")
  // and this brief is marked refused for today.
  const longFormSeconds = Number(process.env.DAILY_GENERATE_LONG_FORM_SECONDS ?? 120);
  // Short-form duration. 30s is the IG/YT-Shorts sweet spot for the
  // current narrator pace (~120 wpm) — gives roughly 3 scenes of
  // 10-15 spoken words each, which is what the typography/stock
  // playbooks are tuned for. Override via env if you want 60s reels.
  const shortFormSeconds = Number(process.env.DAILY_GENERATE_SHORT_FORM_SECONDS ?? 30);
  // Long-form goes FIRST in the job list (and therefore first into the
  // event loop's microtask queue) because it's the most expensive call
  // and the most painful to drop — better to lose a reel than the
  // single long-form essay if a partial timeout still happens.
  const jobs: Job[] = [
    ...picks.longForm.map<Job>((brief) => ({
      brief,
      language: "en",
      style: "long_form_essay",
      durationSeconds: longFormSeconds,
      kind: "long_form",
    })),
    // Rotate language across short-form picks: alternate en / hinglish.
    // Long-form is always English (Indian audience, but watch-time lives
    // on YT search which favours English keyword surfaces).
    ...picks.shortForm.map<Job>((brief, i) => ({
      brief,
      language: (["en", "hinglish"] as const)[i % 2],
      // Alternate style across short-form picks for A/B testing.
      style: i % 2 === 0 ? "typography" : "stock",
      durationSeconds: shortFormSeconds,
      kind: "reel",
    })),
  ];

  const settled = await Promise.allSettled(jobs.map((j) => generateOne(j)));

  const summary: GenerateSummary = {
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
      // A `generateOne` rejection means the function itself threw past
      // its own try/catch — we should never see this, but treat it as
      // failed so the summary is accurate.
      summary.failed += 1;
      summary.errors.push({
        briefId: job.brief.id,
        reason: String((r.reason as Error)?.message ?? r.reason).slice(0, 200),
      });
    }
  }

  await recordAudit({
    actor: "cron:vercel",
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

  return NextResponse.json({ summary });
}

type GenerateOutcome =
  | { outcome: "created" }
  | { outcome: "refused"; reason: string }
  | { outcome: "failed"; reason: string };

async function generateOne(args: {
  brief: ContentBrief;
  language: "en" | "hi" | "hinglish";
  style: "typography" | "stock" | "carousel" | "long_form_essay";
  durationSeconds: number;
  kind: string;
}): Promise<GenerateOutcome> {
  const { brief, language, style, durationSeconds, kind } = args;

  let resource:
    | { title: string; authors?: string[]; year?: number; sourceName: string; url: string }
    | undefined;
  if (brief.citationTopic) {
    // Resolve a published resource tagged with the brief's citation
    // topic. Topics are stored as `tags` rows with category="topic".
    // We pick the most recently published match.
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

    await db
      .insert(contentDrafts)
      .values({
        kind,
        language,
        brief: brief.brief,
        scriptMd: serialiseScriptToMd(script, style),
        status: "script_draft",
      });

    // Per-item audit — flushed BEFORE we return so it lands even if a
    // sibling job still holds the function open. Awaited (not `void`)
    // for the same reason: we want this in the audit table even if
    // Vercel kills the function 50ms later.
    await recordAudit({
      actor: "cron:vercel",
      action: "daily_generate_item",
      meta: { briefId: brief.id, kind, language, outcome: "created" },
    });
    return { outcome: "created" };
  } catch (e) {
    if (e instanceof ScriptRefusal) {
      await recordAudit({
        actor: "cron:vercel",
        action: "daily_generate_item",
        meta: { briefId: brief.id, kind, language, outcome: "refused", reason: e.reason },
      });
      return { outcome: "refused", reason: e.reason };
    }
    const msg = String((e as Error).message).slice(0, 200);
    await recordAudit({
      actor: "cron:vercel",
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
