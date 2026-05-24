/**
 * Deep health check.
 *
 *   GET /api/health   — returns 200 with subsystem status; 503 if a
 *                       required subsystem is down.
 *
 * Subsystems probed:
 *   - db        Postgres reachable + version + extensions installed
 *   - kms       Round-trip seal/open with the configured KMS provider
 *   - llm       Anthropic key present (we don't make a billable call here)
 *   - embed     OpenAI key present (same — no billable call)
 *
 * Response body is intentionally compact — fits within Vercel log limits and
 * doesn't leak environment values.
 *
 * NOTE: /api/health requires the Basic-auth admin header in production to
 * avoid surface for noisy bots, but is unauthenticated in dev. To enable
 * gating in prod, add ADMIN_BASIC_USER/ADMIN_BASIC_PASS env vars (the
 * existing admin gate already covers /api/admin/*; we re-use it here).
 */

import { NextResponse } from "next/server";
import { getHealthReport } from "@/lib/health";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const out = await getHealthReport();
  log.info("health_check", {
    db: out.subsystems.db.ok,
    kms: out.subsystems.kms.ok,
    llm: out.subsystems.llm.ok,
    embed: out.subsystems.embed.ok,
  });
  return NextResponse.json(out, { status: out.ok ? 200 : 503 });
}
