import { NextResponse } from "next/server";
import { z } from "zod";
import {
  pollAllChannelMetrics,
  pollAllPostMetrics,
} from "@/lib/social/metrics-poller";
import { recordAudit } from "@/lib/observability/audit";
import { getActor } from "@/lib/admin/actor";
import { requireApiAdmin } from "@/lib/auth/api-admin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  windowDays: z.number().int().min(1).max(180).optional(),
});

/**
 * POST /api/admin/post-metrics/poll
 *
 * Manually trigger the metrics poller (the same code path the weekly cron
 * uses). Returns the summary report. Admin-gated via the middleware.
 */
export async function POST(req: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof NextResponse) return guard;
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  const [summary, channelSummary] = await Promise.all([
    pollAllPostMetrics(parsed.data),
    pollAllChannelMetrics(),
  ]);

  void recordAudit({
    actor: await getActor(req),
    action: "metrics_poll_manual",
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
