/**
 * POST /api/admin/drafts/[id]/render
 *
 * Triggers a render of the given draft on GitHub Actions. We don't run
 * the render in-process because Remotion's Chromium bundle (~150 MB)
 * exceeds Vercel's serverless function size limit and a single render
 * can take longer than the function timeout.
 *
 * Flow:
 *   1. Admin gate (requireApiAdmin).
 *   2. Validate the draft exists + has a script.
 *   3. POST to GitHub's workflow_dispatch endpoint for
 *      `.github/workflows/render-due.yml` with inputs:
 *        - draft_id: <this draft>
 *        - style:    (optional override; falls back to renderer default)
 *   4. Return the GH Actions URL so the operator can watch progress.
 *      (We don't poll-and-wait — would just hold a function open for 3
 *      minutes.)
 *
 * Required env (Vercel):
 *   - GH_RENDER_TOKEN   : fine-grained PAT with `actions: read+write`
 *                         + `contents: read` on this repo. Falls back
 *                         to GH_AVATAR_TOKEN (already provisioned for
 *                         the legacy avatar pipeline) and GITHUB_TOKEN
 *                         (for local dev where you might pipe `gh auth
 *                         token`).
 *   - GH_RENDER_REPO    : "owner/repo" string. Falls back to
 *                         GH_AVATAR_REPO / GITHUB_REPOSITORY.
 *   - GH_RENDER_BRANCH  : ref to dispatch against (default "main").
 *   - GH_RENDER_WORKFLOW: workflow filename (default "render-due.yml").
 */
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

const Body = z
  .object({
    style: z
      .enum(["typography", "stock", "photo", "avatar", "long_form_essay"])
      .optional(),
  })
  .optional();

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin();
  if (guard instanceof NextResponse) return guard;
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  const json = (await req.json().catch(() => ({}))) as unknown;
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const style = parsed.data?.style;

  const draft = await db.query.contentDrafts.findFirst({
    where: eq(contentDrafts.id, params.id),
  });
  if (!draft) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!draft.scriptMd) {
    return NextResponse.json(
      { error: "no_script", detail: "Draft has no script to render from." },
      { status: 409 },
    );
  }

  const ghToken =
    process.env.GH_RENDER_TOKEN ||
    process.env.GH_AVATAR_TOKEN ||
    process.env.GITHUB_TOKEN;
  if (!ghToken) {
    return NextResponse.json(
      {
        error: "missing_github_token",
        detail:
          "GH_RENDER_TOKEN env var is not set. Generate a fine-grained PAT with `actions: read+write` + `contents: read` on this repo.",
      },
      { status: 503 },
    );
  }
  const ghRepo =
    process.env.GH_RENDER_REPO ||
    process.env.GH_AVATAR_REPO ||
    process.env.GITHUB_REPOSITORY;
  if (!ghRepo || !/^[^/]+\/[^/]+$/.test(ghRepo)) {
    return NextResponse.json(
      {
        error: "missing_github_repo",
        detail: "GH_RENDER_REPO must be set to 'owner/repo'.",
      },
      { status: 503 },
    );
  }
  const ghBranch = process.env.GH_RENDER_BRANCH ?? "main";
  const workflowFile = process.env.GH_RENDER_WORKFLOW ?? "render-due.yml";

  const dispatchUrl = `https://api.github.com/repos/${ghRepo}/actions/workflows/${workflowFile}/dispatches`;
  const dispatchRes = await fetch(dispatchUrl, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${ghToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "intimacy-library-admin",
    },
    body: JSON.stringify({
      ref: ghBranch,
      inputs: {
        draft_id: params.id,
        style: style ?? "",
      },
    }),
  });

  if (!dispatchRes.ok) {
    const text = await dispatchRes.text().catch(() => "");
    void recordAudit({
      actor: await getActor(req),
      action: "draft_render_dispatch_failed",
      meta: {
        draftId: params.id,
        status: dispatchRes.status,
        detail: text.slice(0, 500),
      },
    });
    return NextResponse.json(
      {
        error: "dispatch_failed",
        status: dispatchRes.status,
        detail: text.slice(0, 500),
      },
      { status: 502 },
    );
  }

  // workflow_dispatch returns 204 with no body; we can't link to a
  // specific run id. Link the operator to the workflow's run list
  // instead — their fresh run will be at the top within ~10 seconds.
  const runsUrl = `https://github.com/${ghRepo}/actions/workflows/${workflowFile}`;

  void recordAudit({
    actor: await getActor(req),
    action: "draft_render_dispatched",
    meta: { draftId: params.id, style: style ?? null, runsUrl },
  });

  return NextResponse.json({
    ok: true,
    dispatched: true,
    workflow: workflowFile,
    ref: ghBranch,
    inputs: { draft_id: params.id, style: style ?? null },
    runsUrl,
    detail:
      "Render workflow dispatched. Watch progress at runsUrl; typical render takes 2-3 minutes. The draft row will gain a videoUrl when complete.",
  });
}
