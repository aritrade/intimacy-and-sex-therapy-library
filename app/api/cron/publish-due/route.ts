/**
 * Hourly publish-when-due cron.
 *
 * Triggered by GitHub Actions every hour (.github/workflows/publish-
 * due.yml). Only publishes drafts that BOTH:
 *   1. Have status = "editor_reviewed" (both human approvals on file)
 *   2. Have a non-null `scheduled_at <= now()` (the human explicitly
 *      asked for posting at this time)
 *
 * Drafts without `scheduled_at` are NEVER touched by this cron — those
 * require a human to click "Publish now" in the queue. This is the
 * mechanism by which we keep the "queued review" approval gate honest
 * while still allowing time-of-day optimisation (post at 7-9 PM IST
 * for India audience peak).
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}, same as other crons.
 */

import { NextResponse } from "next/server";
import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts } from "@/lib/db/schema";
import { publishDraft } from "@/lib/social/publish";
import { recordAudit } from "@/lib/observability/audit";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
      { error: "cron_disabled", detail: "Set CRON_SECRET to enable publish-due cron." },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    log.warn("cron_unauthorized", { surface: "publish_due" });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  const due = await db
    .select()
    .from(contentDrafts)
    .where(
      and(
        eq(contentDrafts.status, "editor_reviewed"),
        sql`${contentDrafts.scheduledAt} IS NOT NULL`,
        lte(contentDrafts.scheduledAt, new Date()),
      ),
    )
    .limit(20);

  const summary = {
    scanned: due.length,
    published: 0,
    failed: 0,
    skipped: 0,
    results: [] as Array<{
      draftId: string;
      ok: boolean;
      platforms: string[];
      failureCount: number;
    }>,
  };

  for (const draft of due) {
    if (!draft.videoUrl || !draft.videoUrl.startsWith("https://")) {
      summary.skipped += 1;
      summary.results.push({ draftId: draft.id, ok: false, platforms: [], failureCount: 1 });
      continue;
    }
    const platforms: ("instagram" | "youtube" | "facebook" | "linkedin" | "twitter")[] = [
      "instagram",
      "youtube",
      "facebook",
      "linkedin",
      "twitter",
    ];
    const r = await publishDraft({ draftId: draft.id, platforms });
    if (r.ok) summary.published += 1;
    else summary.failed += 1;
    summary.results.push({
      draftId: draft.id,
      ok: r.ok,
      platforms: Object.keys(r.platformPostIds),
      failureCount: r.failures.length,
    });
  }

  void recordAudit({
    actor: "cron:gh-actions",
    action: "publish_due_cron",
    meta: { ...summary, results: undefined },
  });

  return NextResponse.json({ summary });
}
