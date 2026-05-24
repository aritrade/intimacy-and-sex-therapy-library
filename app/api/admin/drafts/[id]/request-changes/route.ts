/**
 * Structured "request changes" feedback for a draft.
 *
 * POST /api/admin/drafts/[id]/request-changes
 *   body: {
 *     reason: REASON enum,
 *     notes?: string (<= 600 chars; will be PII-scrubbed before storage)
 *   }
 *
 * Side effects:
 *   - Appends one entry to content_drafts.reviewer_notes (jsonb array).
 *   - Writes one audit_log row with the structured reason (no notes — to
 *     stay content-free in the audit table).
 *   - Does NOT change the draft's status. Reviewers can iterate on the draft
 *     without it bouncing between buckets; the dashboard can be extended to
 *     surface "drafts with notes" if needed.
 *
 * Auth: requires clinician, editor, or admin role. The middleware enforces
 * an admin-or-fallback gate; this handler enforces the finer-grained role
 * via requireRole.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts } from "@/lib/db/schema";
import { hasRole } from "@/lib/auth/roles";
import { auth } from "@/lib/auth/auth";
import { recordAudit } from "@/lib/observability/audit";
import { getActor } from "@/lib/admin/actor";
import { hashForCorrelation, scrubObject } from "@/lib/observability/scrub";
import { isBasicAuthEnabled } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { REQUEST_CHANGES_REASONS } from "@/lib/social/review-reasons";

const REASON_VALUES = REQUEST_CHANGES_REASONS.map((r) => r.value);
const REASON_TUPLE = REASON_VALUES as unknown as [string, ...string[]];

const Body = z.object({
  reason: z.enum(REASON_TUPLE),
  notes: z.string().max(600).optional(),
  /** "clinician" | "editor" | "admin" — what role is making this note. */
  role: z.enum(["clinician", "editor", "admin"]),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  // The middleware lets in anyone with the admin role OR a valid Basic-auth
  // header. For per-role distinctions we go a level deeper:
  //   - If a session exists, require the asserted role.
  //   - If the request comes via Basic-auth fallback (no session), trust the
  //     `role` field at face value but only when fallback is enabled.
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const { reason, notes, role } = parsed.data;

  // Auth check:
  //   - With a session: the user must have the role they're claiming (or be admin).
  //   - Without a session, basic-auth fallback (when enabled) is allowed
  //     because the middleware already cleared the request.
  const session = await auth();
  if (session?.user?.id) {
    const userRoles = session.user.roles ?? [];
    if (!hasRole(userRoles, role) && !hasRole(userRoles, "admin")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } else if (!isBasicAuthEnabled()) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const draftRows = await db
    .select({ id: contentDrafts.id, reviewerNotes: contentDrafts.reviewerNotes })
    .from(contentDrafts)
    .where(eq(contentDrafts.id, params.id))
    .limit(1);
  if (draftRows.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const existingNotes = (draftRows[0].reviewerNotes ?? []) as Array<Record<string, unknown>>;

  // The reviewer's free-text notes ARE persisted on the draft (so the next
  // reviewer can read them), but they're scrubbed first. The audit log row
  // does NOT contain the notes — only the structured reason.
  const scrubbedNotes =
    typeof notes === "string" ? (scrubObject({ notes }) as { notes: string }).notes : undefined;

  const actor = await getActor(req);

  const entry = {
    reason,
    notes: scrubbedNotes,
    by: hashForCorrelation(actor),
    role,
    ts: new Date().toISOString(),
  };

  await db
    .update(contentDrafts)
    .set({
      reviewerNotes: sql`coalesce(${contentDrafts.reviewerNotes}, '[]'::jsonb) || ${JSON.stringify(
        [entry],
      )}::jsonb`,
    })
    .where(eq(contentDrafts.id, params.id));

  void recordAudit({
    actor,
    action: "draft_request_changes",
    meta: { draftId: params.id, reason, role },
  });

  return NextResponse.json({ ok: true, appended: { reason, role, ts: entry.ts } });
}

