/**
 * Daily catalog content-sync cron.
 *
 * Schedule: 03:00 IST = 21:30 UTC.
 *
 * Fans out to three independent agents in parallel:
 *   - link-health   probes every published URL, proposes fixes
 *   - freshness     flags resources that are too old for their kind
 *   - discovery     pulls candidates from PubMed + Open Library
 *
 * Each agent writes proposals into `resource_proposals`. NOTHING is
 * applied automatically — all changes flow through /admin/proposals.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}.
 */

import { NextResponse } from "next/server";
import { runLinkHealthAgent } from "@/lib/sync/link-health";
import { runFreshnessAgent } from "@/lib/sync/freshness";
import { runDiscoveryAgent } from "@/lib/sync/discovery";
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
      { error: "cron_disabled", detail: "Set CRON_SECRET to enable content sync." },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    log.warn("cron_unauthorized", { surface: "daily_content_sync" });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  // We capture each agent's result independently — a single agent
  // failing must NOT prevent the others from emitting proposals.
  const [linkHealth, freshness, discovery] = await Promise.allSettled([
    runLinkHealthAgent({ limit: 200 }),
    runFreshnessAgent(),
    runDiscoveryAgent({ limitPerQuery: 4 }),
  ]);

  const summary = {
    linkHealth: settledValue(linkHealth),
    freshness: settledValue(freshness),
    discovery: settledValue(discovery),
  };

  void recordAudit({
    actor: "cron:vercel",
    action: "daily_content_sync_cron",
    meta: {
      linkHealthOk: linkHealth.status === "fulfilled",
      freshnessOk: freshness.status === "fulfilled",
      discoveryOk: discovery.status === "fulfilled",
    },
  });

  return NextResponse.json({ summary });
}

function settledValue<T>(p: PromiseSettledResult<T>): T | { error: string } {
  if (p.status === "fulfilled") return p.value;
  return { error: String((p.reason as Error)?.message ?? p.reason).slice(0, 300) };
}
