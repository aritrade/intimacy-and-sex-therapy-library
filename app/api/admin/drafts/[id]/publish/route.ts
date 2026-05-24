import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts } from "@/lib/db/schema";
import { publishInstagramReel, PublisherRefusal } from "@/lib/social/publishers/instagram";
import { uploadYouTubeShort, YouTubePublisherRefusal } from "@/lib/social/publishers/youtube";
import { recordAudit } from "@/lib/observability/audit";
import { getActor } from "@/lib/admin/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  platforms: z.array(z.enum(["instagram", "youtube"])).min(1),
  /** Mandatory final-mile attestation. */
  iAmTheReviewerAndIWantToPublish: z.literal(true),
});

/**
 * POST /api/admin/drafts/[id]/publish
 *
 * The hardest gate in the system. Refuses unless:
 *   1. status === "editor_reviewed"  (clinician + editor both signed)
 *   2. videoUrl exists and is HTTPS
 *   3. body.iAmTheReviewerAndIWantToPublish === true
 *
 * Even then: per-platform publishers may refuse (missing env / failed
 * container) and we record those failures rather than retry blindly.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", detail: "Missing required attestation flag.", issues: parsed.error.issues },
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
  if (draft.status !== "editor_reviewed") {
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
  if (!draft.videoUrl || !draft.videoUrl.startsWith("https://")) {
    return NextResponse.json(
      {
        error: "missing_video_url",
        detail: "Publishing requires a public HTTPS video URL on the draft.",
      },
      { status: 422 },
    );
  }

  const platformPostIds: Record<string, string> = {};
  const failures: Array<{ platform: string; reason: string; detail?: string }> = [];

  if (platforms.includes("instagram")) {
    try {
      const r = await publishInstagramReel({
        videoUrl: draft.videoUrl,
        caption: extractCaption(draft.scriptMd ?? ""),
      });
      platformPostIds.instagram = r.postId;
    } catch (e) {
      if (e instanceof PublisherRefusal) {
        failures.push({ platform: "instagram", reason: e.reason, detail: e.detail });
      } else {
        failures.push({ platform: "instagram", reason: "exception", detail: String((e as Error).message) });
      }
    }
  }
  if (platforms.includes("youtube")) {
    try {
      // YouTube needs a local file path; v1 expects the renderer to leave it
      // at /public/renders/<id>/video.mp4 — we reconstruct that here.
      const localPath = `${process.cwd()}/public/renders/${draft.id}/video.mp4`;
      const r = await uploadYouTubeShort({
        videoPath: localPath,
        title: extractFirstLine(draft.scriptMd ?? "Untitled"),
        description: extractCaption(draft.scriptMd ?? ""),
      });
      platformPostIds.youtube = r.videoId;
    } catch (e) {
      if (e instanceof YouTubePublisherRefusal) {
        failures.push({ platform: "youtube", reason: e.reason, detail: e.detail });
      } else {
        failures.push({ platform: "youtube", reason: "exception", detail: String((e as Error).message) });
      }
    }
  }

  const anySuccess = Object.keys(platformPostIds).length > 0;
  await db
    .update(contentDrafts)
    .set({
      platformPostIds,
      status: anySuccess ? "posted" : "failed",
      postedAt: anySuccess ? new Date() : null,
    })
    .where(eq(contentDrafts.id, params.id));

  void recordAudit({
    actor: await getActor(req),
    action: anySuccess ? "draft_publish_succeeded" : "draft_publish_failed",
    meta: {
      draftId: params.id,
      platforms,
      successPlatforms: Object.keys(platformPostIds),
      failureCount: failures.length,
    },
  });

  return NextResponse.json(
    { ok: anySuccess, platformPostIds, failures },
    { status: anySuccess ? 200 : 502 },
  );
}

function extractCaption(md: string): string {
  const m = md.match(/# Caption\n([\s\S]*?)(?:\n# |$)/);
  return m?.[1].trim() ?? md.slice(0, 1500);
}
function extractFirstLine(md: string): string {
  const m = md.match(/# Hook\n(.*)/);
  return (m?.[1] ?? "Intimacy & Sex Therapy Library short").slice(0, 100);
}
