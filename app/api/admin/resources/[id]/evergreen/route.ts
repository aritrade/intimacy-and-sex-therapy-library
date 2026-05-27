/**
 * POST /api/admin/resources/[id]/evergreen
 *   body: { isEvergreen: boolean, alsoRejectOpenRefreshProposals?: boolean }
 *
 * Toggle the `is_evergreen` flag on a resource. When marking TRUE we also
 * (optionally, but recommended) reject any open `needs_refresh` proposals
 * against this resource so the queue clears immediately.
 *
 * Admin-only.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resourceProposals, resources } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/roles";
import { getActor } from "@/lib/admin/actor";
import { recordAudit } from "@/lib/observability/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  isEvergreen: z.boolean(),
  alsoRejectOpenRefreshProposals: z.boolean().optional().default(true),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const refusal = await requireRole("admin");
  if (!refusal.ok) return refusal.response;

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { isEvergreen, alsoRejectOpenRefreshProposals } = parsed.data;

  const updated = await db
    .update(resources)
    .set({ isEvergreen, updatedAt: new Date() })
    .where(eq(resources.id, params.id))
    .returning({ id: resources.id, title: resources.title, isEvergreen: resources.isEvergreen });

  if (updated.length === 0) {
    return NextResponse.json({ error: "resource_not_found" }, { status: 404 });
  }

  const actor = await getActor(req);
  let rejectedCount = 0;
  if (isEvergreen && alsoRejectOpenRefreshProposals) {
    const rejected = await db
      .update(resourceProposals)
      .set({
        status: "rejected",
        decidedBy: actor,
        decidedAt: new Date(),
        decisionNotes: "auto: resource marked evergreen",
      })
      .where(
        and(
          eq(resourceProposals.resourceId, params.id),
          eq(resourceProposals.kind, "needs_refresh"),
          eq(resourceProposals.status, "open"),
        ),
      )
      .returning({ id: resourceProposals.id });
    rejectedCount = rejected.length;
  }

  void recordAudit({
    actor,
    action: isEvergreen ? "resource_marked_evergreen" : "resource_unmarked_evergreen",
    meta: { resourceId: params.id, rejectedProposals: rejectedCount },
  });

  return NextResponse.json({
    ok: true,
    resource: updated[0],
    rejectedProposals: rejectedCount,
  });
}
