/**
 * POST /api/admin/proposals/[id]/decide
 *   body: { decision: "approve" | "reject", notes?: string }
 *
 * Approving a proposal flips its status, then runs `applyProposal` if
 * the kind is auto-applyable. Rejecting just stamps the row with the
 * note for audit.
 *
 * The existing admin gate (lib/auth/admin-page-guard) protects this
 * route via the routing middleware on /api/admin/*.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resourceProposals } from "@/lib/db/schema";
import { applyProposal } from "@/lib/sync/apply-proposal";
import { recordAudit } from "@/lib/observability/audit";
import { getActor } from "@/lib/admin/actor";
import { requireApiAdmin } from "@/lib/auth/api-admin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  decision: z.enum(["approve", "reject"]),
  notes: z.string().max(400).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin();
  if (guard instanceof NextResponse) return guard;
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const { decision, notes } = parsed.data;

  const existing = await db.query.resourceProposals.findFirst({
    where: eq(resourceProposals.id, params.id),
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (existing.status !== "open") {
    return NextResponse.json(
      { error: "wrong_status", current: existing.status },
      { status: 409 },
    );
  }

  const actor = await getActor(req);

  if (decision === "reject") {
    const updated = await db
      .update(resourceProposals)
      .set({
        status: "rejected",
        decidedBy: actor,
        decidedAt: new Date(),
        decisionNotes: notes ?? null,
      })
      .where(eq(resourceProposals.id, params.id))
      .returning();

    void recordAudit({
      actor,
      action: "proposal_rejected",
      meta: { proposalId: params.id, kind: existing.kind },
    });

    return NextResponse.json({ proposal: updated[0] });
  }

  // Approve path: stamp approved → run apply → stamp applied/errored
  await db
    .update(resourceProposals)
    .set({
      status: "approved",
      decidedBy: actor,
      decidedAt: new Date(),
      decisionNotes: notes ?? null,
    })
    .where(eq(resourceProposals.id, params.id));

  const result = await applyProposal({
    kind: existing.kind,
    resourceId: existing.resourceId,
    payload: existing.payload,
  });

  const finalStatus = result.ok ? "applied" : "errored";
  const updated = await db
    .update(resourceProposals)
    .set({
      status: finalStatus,
      appliedResult: result.ok ? result.detail : { error: result.error, ...result.detail },
    })
    .where(eq(resourceProposals.id, params.id))
    .returning();

  void recordAudit({
    actor,
    action: result.ok ? "proposal_applied" : "proposal_apply_failed",
    meta: { proposalId: params.id, kind: existing.kind, error: result.ok ? undefined : result.error },
  });

  return NextResponse.json({ proposal: updated[0], applyResult: result });
}
