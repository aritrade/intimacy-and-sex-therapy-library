/**
 * POST /api/admin/proposals/bulk-reject
 *   body: { kind?: ProposalKind, proposedBy?: string, reason?: string, minAgeDays?: number }
 *
 * Marks every matching OPEN proposal as `rejected` in one shot. The
 * combination of filters is optional but at least ONE filter must be
 * provided — we refuse to no-op-reject the entire queue by accident.
 *
 * Use cases:
 *   - "Reject every open `needs_refresh` from the freshness agent" after the
 *     evergreen rules and raised thresholds have been put in place.
 *   - "Reject every open proposal older than 30 days" to keep the queue tidy.
 *
 * Auth: admin role (mutates catalog-management state; not a viewer-safe
 * action).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resourceProposals } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/roles";
import { getActor } from "@/lib/admin/actor";
import { recordAudit } from "@/lib/observability/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KindSchema = z.enum([
  "fix_url",
  "needs_refresh",
  "new_resource",
  "remove_resource",
  "metadata_drift",
]);

const Body = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(500).optional(),
    kind: KindSchema.optional(),
    proposedBy: z.string().max(80).optional(),
    reason: z.string().max(300).optional(),
    minAgeDays: z.number().int().min(0).max(3650).optional(),
  })
  .refine((b) => !!(b.ids || b.kind || b.proposedBy || b.minAgeDays), {
    message: "Provide ids or at least one of: kind, proposedBy, minAgeDays.",
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
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { ids, kind, proposedBy, reason, minAgeDays } = parsed.data;

  const filters = [eq(resourceProposals.status, "open")];
  if (ids && ids.length > 0) filters.push(inArray(resourceProposals.id, ids));
  if (kind) filters.push(eq(resourceProposals.kind, kind));
  if (proposedBy) filters.push(eq(resourceProposals.proposedBy, proposedBy));
  if (typeof minAgeDays === "number") {
    const cutoff = new Date(Date.now() - minAgeDays * 86_400_000);
    filters.push(lte(resourceProposals.createdAt, cutoff));
  }

  const actor = await getActor(req);

  const result = await db
    .update(resourceProposals)
    .set({
      status: "rejected",
      decidedBy: actor,
      decidedAt: new Date(),
      decisionNotes:
        reason ??
        `bulk-reject: ${[
          kind ? `kind=${kind}` : null,
          proposedBy ? `agent=${proposedBy}` : null,
          typeof minAgeDays === "number" ? `min_age_days=${minAgeDays}` : null,
        ]
          .filter(Boolean)
          .join(", ")}`,
    })
    .where(and(...filters))
    .returning({ id: resourceProposals.id });

  void recordAudit({
    actor,
    action: "proposals_bulk_rejected",
    meta: { kind, proposedBy, minAgeDays, count: result.length },
  });

  return NextResponse.json({ ok: true, rejected: result.length });
}

// Suppress unused-import lint when the helper isn't used in a future change.
void sql;
