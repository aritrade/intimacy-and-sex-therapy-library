import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts } from "@/lib/db/schema";
import { recordAudit } from "@/lib/observability/audit";
import { getActor } from "@/lib/admin/actor";
import { requireApiAdmin } from "@/lib/auth/api-admin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  role: z.enum(["clinician", "editor"]),
  reviewerId: z.string().uuid().optional(),
});

/**
 * POST /api/admin/drafts/[id]/approve  body: { role: "clinician" | "editor" }
 *
 * Stamps the appropriate reviewer field. Status transitions:
 *   script_draft   → clinician_reviewed  (after clinician)
 *   clinician_reviewed → editor_reviewed (after editor; we expect render to
 *                                          have happened in between, but we
 *                                          allow the fast path for v1)
 */
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
  const { role, reviewerId } = parsed.data;

  const existing = await db.query.contentDrafts.findFirst({
    where: eq(contentDrafts.id, params.id),
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const update: Partial<typeof contentDrafts.$inferInsert> = {};

  if (role === "clinician") {
    if (existing.status !== "script_draft") {
      return NextResponse.json({ error: "wrong_status", current: existing.status }, { status: 409 });
    }
    update.status = "clinician_reviewed";
    if (reviewerId) update.clinicianReviewerId = reviewerId;
  } else {
    if (existing.status !== "rendered" && existing.status !== "clinician_reviewed") {
      return NextResponse.json({ error: "wrong_status", current: existing.status }, { status: 409 });
    }
    update.status = "editor_reviewed";
    if (reviewerId) update.editorReviewerId = reviewerId;
  }

  const updated = await db
    .update(contentDrafts)
    .set(update)
    .where(eq(contentDrafts.id, params.id))
    .returning();

  void recordAudit({
    actor: await getActor(req),
    action: `draft_approve_${role}`,
    meta: { draftId: params.id, fromStatus: existing.status, toStatus: update.status },
  });

  return NextResponse.json({ draft: updated[0] });
}
