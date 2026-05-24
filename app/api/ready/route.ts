/**
 * Liveness / readiness probe. Cheap by design — doesn't touch DB or KMS,
 * just confirms the process is up. Use /api/health for deep checks.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
