/**
 * POST /api/admin/help-flags   { ref, hidden }
 *
 * Admin moderation for aggregated Find Help results. Sets `hidden` on every
 * flag row for a given `result_ref` (hidden results are filtered out of cached
 * responses on read). If no flag row exists yet, one is created so the hide
 * still takes effect. Admin-only.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { helpResultFlags } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/roles";
import { getActor } from "@/lib/admin/actor";
import { recordAudit } from "@/lib/observability/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  ref: z.string().min(1).max(256),
  hidden: z.boolean(),
});

export async function POST(req: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const refusal = await requireRole("admin");
  if (!refusal.ok) return refusal.response;

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const { ref, hidden } = parsed.data;

  const updated = await db
    .update(helpResultFlags)
    .set({ hidden })
    .where(eq(helpResultFlags.resultRef, ref))
    .returning({ id: helpResultFlags.id });

  if (updated.length === 0) {
    await db.insert(helpResultFlags).values({ resultRef: ref, reason: "admin", hidden });
  }

  void recordAudit({
    actor: await getActor(req),
    action: hidden ? "help_result_hidden" : "help_result_unhidden",
    meta: { ref },
  });

  return NextResponse.json({ ok: true, ref, hidden });
}
