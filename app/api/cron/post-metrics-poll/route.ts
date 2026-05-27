/**
 * Vercel Cron entry for the post-metrics poller.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when the
 * `CRON_SECRET` env var is set on the project. We refuse otherwise. This
 * keeps the cron endpoint reachable without putting it behind the admin
 * session gate (the admin gate's middleware would block the cron worker).
 *
 * Schedule: weekly at 06:00 UTC on Mondays — see vercel.json. Adjust to
 * your audience's timezone if needed; the platform's docs say `* * * * *`
 * is allowed but discouraged on hobby plans.
 */

import { NextResponse } from "next/server";
import {
  pollAllChannelMetrics,
  pollAllPostMetrics,
} from "@/lib/social/metrics-poller";
import { recordAudit } from "@/lib/observability/audit";
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
      { error: "cron_disabled", detail: "Set CRON_SECRET in env to enable the weekly poll." },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    log.warn("cron_unauthorized", { surface: "post_metrics_poll" });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Run both polls. They're independent — channel poll being unconfigured
  // doesn't stop the per-post poll from running, and vice versa.
  const [summary, channelSummary] = await Promise.all([
    pollAllPostMetrics({ limit: 100, windowDays: 60 }),
    pollAllChannelMetrics(),
  ]);

  void recordAudit({
    actor: "cron:vercel",
    action: "metrics_poll_cron",
    meta: {
      scanned: summary.scanned,
      updated: summary.updated,
      takedowns: summary.takedowns,
      failures: summary.failures.length,
      channelPulled: channelSummary.pulled,
      channelFailed: channelSummary.failed,
    },
  });

  return NextResponse.json({ summary, channelSummary });
}
