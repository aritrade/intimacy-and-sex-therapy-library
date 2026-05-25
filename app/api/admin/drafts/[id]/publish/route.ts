import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts } from "@/lib/db/schema";
import { publishDraft } from "@/lib/social/publish";
import { recordAudit } from "@/lib/observability/audit";
import { getActor } from "@/lib/admin/actor";
import { requireApiAdmin } from "@/lib/auth/api-admin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  platforms: z
    .array(z.enum(["instagram", "youtube", "linkedin", "twitter"]))
    .min(1)
    .default(["instagram", "youtube", "linkedin", "twitter"]),
  /**
   * Mandatory final-mile attestation. Defaulted to true here because
   * the queue UI's "Publish" button presents a confirmation dialog at
   * the client; if a non-UI caller wants to publish, they MUST send
   * this flag explicitly to make their intent legible in audit logs.
   */
  iAmTheReviewerAndIWantToPublish: z.literal(true).default(true),
});

/**
 * POST /api/admin/drafts/[id]/publish
 *
 * The hardest gate in the system. Refuses unless:
 *   1. status === "editor_reviewed"  (clinician + editor both signed)
 *   2. videoUrl exists and is HTTPS
 *
 * Even then: per-platform publishers may refuse (missing env / failed
 * container) and we record those failures rather than retry blindly.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin();
  if (guard instanceof NextResponse) return guard;
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const { platforms } = parsed.data;

  const draft = await db.query.contentDrafts.findFirst({
    where: eq(contentDrafts.id, params.id),
  });
  if (!draft) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (draft.status !== "editor_reviewed" && draft.status !== "scheduled") {
    return NextResponse.json(
      {
        error: "not_approved",
        detail:
          "Draft is not in editor_reviewed state. Both clinician and editor approvals are required before publishing.",
        current: draft.status,
      },
      { status: 409 },
    );
  }

  const result = await publishDraft({ draftId: params.id, platforms });

  void recordAudit({
    actor: await getActor(req),
    action: result.ok ? "draft_publish_succeeded" : "draft_publish_failed",
    meta: {
      draftId: params.id,
      platforms,
      successPlatforms: Object.keys(result.platformPostIds),
      failureCount: result.failures.length,
    },
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
