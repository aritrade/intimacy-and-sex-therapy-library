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
 *   - 2 short-form scripts → reels for IG + YT Shorts (one EN, one HI)
 *   - 1 long-form script → YouTube essay
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

  const shortFormCount = Number(process.env.DAILY_GENERATE_SHORT_FORM ?? 2);
  const longFormCount = Number(process.env.DAILY_GENERATE_LONG_FORM ?? 1);

  const picks = pickBriefsForToday({
    date: new Date(),
    shortFormCount,
    longFormCount,
    recentlyUsedIds,
  });

  const summary: GenerateSummary = {
    attempted: 0,
    created: 0,
    refused: 0,
    failed: 0,
    briefIds: [],
    errors: [],
  };

  // Rotate language across short-form picks: alternate en / hinglish.
  // Long-form is always English (Indian audience, but watch-time lives
  // on YT search which favours English keyword surfaces).
  const shortLangs: Array<"en" | "hinglish"> = ["en", "hinglish"];
  for (let i = 0; i < picks.shortForm.length; i++) {
    const brief = picks.shortForm[i];
    const language = shortLangs[i % shortLangs.length];
    // Alternate stylet across short-form picks for A/B testing (per user request).
    const style = i % 2 === 0 ? "typography" : "stock";
    await generateOne({
      brief,
      language,
      style,
      durationSeconds: 60,
      kind: "reel",
      summary,
    });
  }

  for (const brief of picks.longForm) {
    await generateOne({
      brief,
      language: "en",
      style: "long_form_essay",
      durationSeconds: 240,
      kind: "long_form",
      summary,
    });
  }

  void recordAudit({
    actor: "cron:vercel",
    action: "daily_generate_cron",
    meta: {
      attempted: summary.attempted,
      created: summary.created,
      refused: summary.refused,
      failed: summary.failed,
      briefIds: summary.briefIds,
    },
  });

  return NextResponse.json({ summary });
}

async function generateOne(args: {
  brief: ContentBrief;
  language: "en" | "hi" | "hinglish";
  style: "typography" | "stock" | "carousel" | "long_form_essay";
  durationSeconds: number;
  kind: string;
  summary: GenerateSummary;
}) {
  const { brief, language, style, durationSeconds, kind, summary } = args;
  summary.attempted += 1;

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

    summary.created += 1;
    summary.briefIds.push(brief.id);
  } catch (e) {
    if (e instanceof ScriptRefusal) {
      summary.refused += 1;
      summary.errors.push({ briefId: brief.id, reason: `refusal:${e.reason}` });
    } else {
      summary.failed += 1;
      summary.errors.push({ briefId: brief.id, reason: String((e as Error).message).slice(0, 200) });
    }
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
