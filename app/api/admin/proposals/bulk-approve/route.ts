/**
 * POST /api/admin/proposals/bulk-approve
 *   body:
 *     { ids: string[] }                       — explicit selection, OR
 *     { kind?, proposedBy?, minAgeDays? }     — filter-based (require ≥1 filter)
 *
 * Approves every matching OPEN proposal, runs `applyProposal` for each,
 * and stamps the final status (`applied` on success, `errored` on
 * failure). Returns a per-item result list so the UI can show "12 of 15
 * applied · 3 errored".
 *
 * Admin-only. Concurrency is bounded so a 100-item bulk-approve doesn't
 * spawn 100 concurrent DB writes.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resourceProposals } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/roles";
import { getActor } from "@/lib/admin/actor";
import { recordAudit } from "@/lib/observability/audit";
import { applyProposal } from "@/lib/sync/apply-proposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const KindSchema = z.enum([
  "fix_url",
  "needs_refresh",
  "new_resource",
  "remove_resource",
  "metadata_drift",
]);

const Body = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(200).optional(),
    kind: KindSchema.optional(),
    proposedBy: z.string().max(80).optional(),
    minAgeDays: z.number().int().min(0).max(3650).optional(),
  })
  .refine((b) => !!(b.ids || b.kind || b.proposedBy || b.minAgeDays), {
    message: "Provide ids or at least one filter (kind / proposedBy / minAgeDays).",
  });

/**
 * Cap how many applyProposal mutations run at once. Higher → faster bulk
 * apply, but more concurrent DB writes and more LLM/ingest pressure for
 * future enrichment steps. 5 is a safe default that still finishes a
 * 50-item batch in a few seconds.
 */
const CONCURRENCY = 5;

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
  const { ids, kind, proposedBy, minAgeDays } = parsed.data;

  // Resolve which proposal rows are in scope. We always reload OPEN rows
  // from the DB so a stale selection from the UI can't approve something
  // an admin just rejected from another tab.
  const filters = [eq(resourceProposals.status, "open")];
  if (ids && ids.length > 0) filters.push(inArray(resourceProposals.id, ids));
  if (kind) filters.push(eq(resourceProposals.kind, kind));
  if (proposedBy) filters.push(eq(resourceProposals.proposedBy, proposedBy));
  if (typeof minAgeDays === "number") {
    const cutoff = new Date(Date.now() - minAgeDays * 86_400_000);
    filters.push(lte(resourceProposals.createdAt, cutoff));
  }

  const candidates = await db
    .select()
    .from(resourceProposals)
    .where(and(...filters))
    .limit(200);

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, applied: 0, errored: 0, results: [] });
  }

  const actor = await getActor(req);

  // Stamp every candidate to `approved` first so racing clients can't
  // double-apply. We'll move to `applied` / `errored` per-item below.
  await db
    .update(resourceProposals)
    .set({
      status: "approved",
      decidedBy: actor,
      decidedAt: new Date(),
      decisionNotes: "bulk-approve",
    })
    .where(
      and(
        eq(resourceProposals.status, "open"),
        inArray(
          resourceProposals.id,
          candidates.map((c) => c.id),
        ),
      ),
    );

  const results: Array<{
    id: string;
    kind: string;
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }> = [];

  // Bounded concurrency: run CONCURRENCY at a time.
  const queue = [...candidates];
  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) return;
      try {
        const result = await applyProposal({
          kind: item.kind,
          resourceId: item.resourceId,
          payload: item.payload as Record<string, unknown>,
        });
        const finalStatus = result.ok ? "applied" : "errored";
        await db
          .update(resourceProposals)
          .set({
            status: finalStatus,
            appliedResult: result.ok
              ? result.detail
              : { error: result.error, ...result.detail },
          })
          .where(eq(resourceProposals.id, item.id));
        results.push({
          id: item.id,
          kind: item.kind,
          ok: result.ok,
          error: result.ok ? undefined : result.error,
          detail: result.ok ? result.detail : result.detail,
        });
      } catch (e) {
        const msg = String((e as Error)?.message ?? e).slice(0, 300);
        await db
          .update(resourceProposals)
          .set({
            status: "errored",
            appliedResult: { error: "exception", message: msg },
          })
          .where(eq(resourceProposals.id, item.id));
        results.push({ id: item.id, kind: item.kind, ok: false, error: msg });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const applied = results.filter((r) => r.ok).length;
  const errored = results.length - applied;

  void recordAudit({
    actor,
    action: "proposals_bulk_approved",
    meta: { requested: candidates.length, applied, errored, kind, proposedBy },
  });

  return NextResponse.json({ ok: true, applied, errored, results });
}
