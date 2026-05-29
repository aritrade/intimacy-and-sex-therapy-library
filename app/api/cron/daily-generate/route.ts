/**
 * Daily content-engine cron (Vercel entrypoint).
 *
 * Schedule: 05:00 IST = 23:30 UTC. Picks a curated set of briefs and creates
 * `script_draft` entries. NOTHING auto-publishes — every draft lands in the
 * queue for human review.
 *
 * What it generates per run (configurable via env):
 *   - 3 short-form scripts → 30s reels for IG + YT Shorts (en / hinglish)
 *   - 2 long-form scripts → 2-minute YouTube essays (always EN)
 *
 * The actual work — brief mix, dedup window, queue-full guard, parallel
 * generation, and audit emission — lives in lib/social/daily-generate-core.ts
 * so this route and scripts/daily-generate.ts (the GitHub Actions runner,
 * which is not bound by Vercel's 60s Hobby cap) share one implementation.
 * This route owns only the CRON_SECRET auth gate and the HTTP envelope.
 *
 * Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextResponse } from "next/server";
import { runDailyGenerate } from "@/lib/social/daily-generate-core";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const result = await runDailyGenerate({ actor: "cron:vercel" });
  if (result.skipped) {
    return NextResponse.json(
      {
        skipped: true,
        reason: result.reason,
        stuckCount: result.stuckCount,
        threshold: result.threshold,
      },
      { status: 200 },
    );
  }

  return NextResponse.json({
    summary: {
      attempted: result.attempted,
      created: result.created,
      refused: result.refused,
      failed: result.failed,
      briefIds: result.briefIds,
      errors: result.errors,
    },
  });
}
