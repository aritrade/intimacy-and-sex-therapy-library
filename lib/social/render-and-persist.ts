/**
 * Shared "render a draft from the DB and persist artifacts" helper.
 *
 * Used by:
 *   - scripts/render-draft.ts  (manual CLI: `npm run render -- <id>`)
 *   - scripts/render-due.ts    (GH Actions hourly cron: batch unrendered)
 *   - app/api/admin/drafts/[id]/render/route.ts (admin button — actually
 *     triggers the GH Actions workflow which then calls this helper on
 *     a GH runner; the helper itself never runs in a Vercel function
 *     because Remotion's Chromium bundle exceeds the 50 MB function size
 *     limit).
 *
 * The two interesting bits are:
 *
 *   1. **Status transitions.** Render is allowed to fire at ANY status
 *      that hasn't been published. The transition table is:
 *
 *        script_draft     → script_draft     (preserve: clinician hasn't
 *                                              seen it yet, just attach a
 *                                              video preview to the row)
 *        clinician_reviewed → rendered       (the classical CLI flow)
 *        rendered         → rendered         (no-op for re-renders)
 *        editor_reviewed  → editor_reviewed  (preserve approvals)
 *        scheduled        → scheduled        (preserve the schedule slot)
 *        posted/published → preserve         (re-render of a live video
 *                                              is allowed for emergency
 *                                              fixes, but never undoes
 *                                              the publish state)
 *
 *      Critical: the previous CLI script flipped script_draft → rendered
 *      which silently bypassed clinician review (editor approval accepts
 *      both "clinician_reviewed" AND "rendered"). The new behaviour
 *      preserves script_draft so the human-in-the-loop guardrail stays
 *      honest while still letting the clinician PREVIEW the video.
 *
 *   2. **Idempotency.** The render writes to the same Blob path
 *      `renders/<draftId>/video.mp4`; lib/social/render.ts appends a
 *      ?v=<timestamp> cache-buster to the URL it returns so the admin
 *      preview never serves stale bytes. Re-renders are safe.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts } from "@/lib/db/schema";
import { renderDraft, type RenderInput, type RenderResult } from "@/lib/social/render";
import type { GeneratedScript } from "@/lib/social/script-generator";

/**
 * Statuses that MUST be preserved across a render. Includes script_draft
 * so the clinician-review gate isn't accidentally bypassed by auto-render.
 */
const PRESERVE_STATUSES = new Set([
  "script_draft",
  "editor_reviewed",
  "scheduled",
  "posted",
  "published",
]);

export type RenderAndPersistResult = {
  draftId: string;
  fromStatus: string;
  toStatus: string;
  render: RenderResult;
};

export class RenderPersistError extends Error {
  constructor(
    public reason: "not_found" | "no_script" | "render_failed",
    public detail?: string,
  ) {
    super(`${reason}${detail ? `: ${detail}` : ""}`);
  }
}

/**
 * Load a draft, render it, persist the artifacts + (possibly preserved)
 * status. Throws RenderPersistError on terminal failure.
 */
export async function renderDraftAndPersist(
  draftId: string,
  opts?: { style?: RenderInput["style"] },
): Promise<RenderAndPersistResult> {
  const draft = await db.query.contentDrafts.findFirst({
    where: eq(contentDrafts.id, draftId),
  });
  if (!draft) throw new RenderPersistError("not_found", draftId);
  if (!draft.scriptMd) throw new RenderPersistError("no_script", draftId);

  const script = parseScriptMd(draft.scriptMd);

  let result: RenderResult;
  try {
    result = await renderDraft({
      draftId: draft.id,
      script,
      language: draft.language as "en" | "hi" | "hinglish",
      style: opts?.style,
    });
  } catch (e) {
    // Record the failed attempt so the render-due cron can back off (see
    // scripts/render-due.ts). Best-effort: never let the bookkeeping update
    // mask the original render error. We leave status + video_url untouched
    // so the draft stays eligible for a (backed-off) retry.
    try {
      await db
        .update(contentDrafts)
        .set({
          renderAttempts: sql`${contentDrafts.renderAttempts} + 1`,
          lastRenderAttemptAt: new Date(),
        })
        .where(eq(contentDrafts.id, draft.id));
    } catch (bookkeepErr) {
      console.warn(
        "[render-and-persist] failed to record render attempt:",
        (bookkeepErr as Error).message,
      );
    }
    throw new RenderPersistError("render_failed", String((e as Error).message));
  }

  const nextStatus = PRESERVE_STATUSES.has(draft.status) ? draft.status : "rendered";

  await db
    .update(contentDrafts)
    .set({
      videoUrl: result.publicVideoUrl,
      voiceoverUrl: result.publicVoiceoverUrl,
      captionsSrt: result.captionsSrt,
      status: nextStatus,
      // Successful render clears the backoff so future re-renders start fresh.
      renderAttempts: 0,
      lastRenderAttemptAt: new Date(),
    })
    .where(eq(contentDrafts.id, draft.id));

  return { draftId, fromStatus: draft.status, toStatus: nextStatus, render: result };
}

/**
 * Parse the markdown produced by serialiseScriptToMd in
 * app/api/cron/daily-generate/route.ts back into the GeneratedScript
 * shape that renderDraft expects. Mirrors scripts/render-draft.ts.
 */
function parseScriptMd(md: string): GeneratedScript {
  const get = (h: string) => {
    const re = new RegExp(`# ${h}\\n([\\s\\S]*?)(?:\\n# |$)`);
    return md.match(re)?.[1].trim() ?? "";
  };
  const hook = get("Hook");
  const cta = get("CTA");
  const caption = get("Caption");
  const citationLine = get("Citation") || null;
  const hashtags = get("Hashtags").split(/\s+/).filter(Boolean);
  const durationStr = get("Duration").replace(/s$/, "");
  const duration = Number(durationStr) || 60;
  const body = get("Body")
    .split(/\n/)
    .map((line) => {
      const m = line.match(/^\d+\.\s*\((\d+(?:\.\d+)?)s\)\s*(.+)$/);
      return m ? { seconds: Number(m[1]), text: m[2] } : null;
    })
    .filter((x): x is { seconds: number; text: string } => x !== null);

  return {
    hook,
    body,
    cta,
    caption,
    hashtags,
    citationLine,
    warning: null,
    durationSeconds: duration,
  };
}
