import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts } from "@/lib/db/schema";
import { recordAudit } from "@/lib/observability/audit";
import { getActor } from "@/lib/admin/actor";
import { requireApiAdmin } from "@/lib/auth/api-admin-guard";
import { reserveNextSlots } from "@/lib/social/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/drafts/bulk-approve
 * body: { ids: string[], iAmTheReviewerAndIApprove: true }
 *
 * Fast-approve: collapses the clinician + editor gates into ONE deliberate
 * human action for the drafts named in `ids`. This is NOT auto-approval — it
 * still requires an authenticated admin to click, and an explicit attestation
 * flag so the intent is legible in the audit log. It exists to clear a review
 * backlog quickly without removing the human checkpoint.
 *
 * Each approved draft is moved to `editor_reviewed` and stamped with the next
 * throttled peak `scheduled_at` (so the hourly publish-due cron rolls it out
 * gradually). Drafts already past the gate, missing, or in a terminal state are
 * reported as skipped rather than mutated.
 */
const Body = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  iAmTheReviewerAndIApprove: z.literal(true),
});

// Statuses from which a single fast-approve legitimately jumps to editor_reviewed.
const APPROVABLE = new Set(["script_draft", "clinician_reviewed", "rendered"]);

export async function POST(req: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof NextResponse) return guard;
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { ids } = parsed.data;
  const actor = await getActor(req);

  const rows = await db.query.contentDrafts.findMany({
    where: (d, { inArray }) => inArray(d.id, ids),
  });
  const found = new Map(rows.map((r) => [r.id, r]));

  const eligible = ids.filter((id) => {
    const d = found.get(id);
    return d && APPROVABLE.has(d.status);
  });

  // Reserve one throttled slot per eligible draft up front so the batch never
  // double-books a time slot (see lib/social/schedule.ts).
  const slots = await reserveNextSlots(eligible.length);

  const results: Array<{ id: string; ok: boolean; status?: string; scheduledAt?: string; reason?: string }> = [];
  let approved = 0;

  for (const id of ids) {
    const draft = found.get(id);
    if (!draft) {
      results.push({ id, ok: false, reason: "not_found" });
      continue;
    }
    if (!APPROVABLE.has(draft.status)) {
      results.push({ id, ok: false, status: draft.status, reason: "not_approvable" });
      continue;
    }
    const scheduledAt = draft.scheduledAt ?? slots[approved] ?? null;
    const note = {
      reason: "bulk_approve",
      notes: "Clinician + editor gates cleared in one fast-approve action.",
      by: actor,
      role: "admin" as const,
      ts: new Date().toISOString(),
    };
    await db
      .update(contentDrafts)
      .set({
        status: "editor_reviewed",
        scheduledAt,
        reviewerNotes: sql`coalesce(${contentDrafts.reviewerNotes}, '[]'::jsonb) || ${JSON.stringify([note])}::jsonb`,
      })
      .where(eq(contentDrafts.id, id));
    approved += 1;
    results.push({
      id,
      ok: true,
      status: "editor_reviewed",
      scheduledAt: scheduledAt?.toISOString(),
    });
  }

  const summary = { requested: ids.length, approved, skipped: ids.length - approved };

  void recordAudit({
    actor,
    action: "draft_bulk_approve",
    meta: { ...summary, ids },
  });

  return NextResponse.json({ summary, results });
}
