/**
 * POST /api/admin/sync/run
 *   body: { agents?: ("link-health" | "freshness" | "discovery")[] }
 *
 * Manually trigger the catalog-sync agents from the admin UI without
 * waiting for the daily cron. The body lets the operator pick a subset
 * of agents — e.g. "run discovery only" after fixing its config.
 *
 * Admin-only. Mirrors the cron handler's behaviour but doesn't require
 * CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { runLinkHealthAgent } from "@/lib/sync/link-health";
import { runFreshnessAgent } from "@/lib/sync/freshness";
import { runDiscoveryAgent } from "@/lib/sync/discovery";
import { requireRole } from "@/lib/auth/roles";
import { getActor } from "@/lib/admin/actor";
import { recordAudit } from "@/lib/observability/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  agents: z
    .array(z.enum(["link-health", "freshness", "discovery"]))
    .min(1)
    .optional(),
});

export async function POST(req: Request) {
  const refusal = await requireRole("admin");
  if (!refusal.ok) return refusal.response;
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const wanted = new Set(parsed.data.agents ?? ["link-health", "freshness", "discovery"]);

  const tasks: Array<Promise<unknown>> = [];
  const labels: string[] = [];
  if (wanted.has("link-health")) {
    tasks.push(runLinkHealthAgent({ limit: 200 }));
    labels.push("link-health");
  }
  if (wanted.has("freshness")) {
    tasks.push(runFreshnessAgent());
    labels.push("freshness");
  }
  if (wanted.has("discovery")) {
    tasks.push(runDiscoveryAgent({ limitPerQuery: 5 }));
    labels.push("discovery");
  }

  const settled = await Promise.allSettled(tasks);
  const summary: Record<string, unknown> = {};
  settled.forEach((s, i) => {
    summary[labels[i]] =
      s.status === "fulfilled"
        ? s.value
        : { error: String((s.reason as Error)?.message ?? s.reason).slice(0, 300) };
  });

  void recordAudit({
    actor: await getActor(req),
    action: "sync_agents_run_manually",
    meta: { agents: Array.from(wanted) },
  });

  return NextResponse.json({ ok: true, summary });
}
