/**
 * POST /api/admin/drafts/[id]/rewrite-script
 *
 * The "act on this feedback" endpoint for the Request Changes section.
 *
 * Side effects, in order:
 *   1. Optionally append a new reviewer note (same shape as /request-changes).
 *   2. Regenerate the script via generateScript() with the ENTIRE accumulated
 *      reviewer-notes history + the previous scriptMd passed in as feedback
 *      context. The model sees what was rejected and why.
 *   3. Overwrite scriptMd on the row.
 *   4. Clear videoUrl / voiceoverUrl / captionsSrt (the old video no longer
 *      matches the new script).
 *   5. Set status back to "script_draft" so the draft re-enters the full
 *      review cycle (clinician -> editor -> publish).
 *   6. Optionally auto-dispatch the GH Actions render-due workflow so the
 *      operator doesn't have to click Render separately. Controlled by
 *      `autoRender: true` in the body (defaults to true for the UI flow).
 *
 * Audit:
 *   - draft_request_changes (with the appended reason/role if a note was added)
 *   - draft_script_regenerated (with previous + new word counts + chapter counts)
 *   - draft_render_dispatched (only if autoRender succeeded)
 *
 * Auth: same gate as the other admin draft routes — requireApiAdmin.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts } from "@/lib/db/schema";
import { generateScript, ScriptRefusal } from "@/lib/social/script-generator";
import { recordAudit } from "@/lib/observability/audit";
import { getActor } from "@/lib/admin/actor";
import { requireApiAdmin } from "@/lib/auth/api-admin-guard";
import { hashForCorrelation, scrubObject } from "@/lib/observability/scrub";
import { REQUEST_CHANGES_REASONS } from "@/lib/social/review-reasons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Script regeneration calls the LLM (Groq usually 5-15s, occasionally 30s
// with the word-count-guard retry). Auto-render dispatches to GH Actions
// which is fire-and-forget. 60s is plenty.
export const maxDuration = 60;

const REASON_VALUES = REQUEST_CHANGES_REASONS.map((r) => r.value);
const REASON_TUPLE = REASON_VALUES as unknown as [string, ...string[]];

const Body = z.object({
  /** If provided, appended to reviewer_notes BEFORE the regeneration runs. */
  reason: z.enum(REASON_TUPLE).optional(),
  notes: z.string().max(600).optional(),
  role: z.enum(["clinician", "editor", "admin"]).default("admin"),
  /** Whether to dispatch the render-due GH Action immediately after rewrite. */
  autoRender: z.boolean().default(true),
});

type ReviewerNote = {
  reason: string;
  notes?: string;
  by?: string;
  role?: string;
  ts?: string;
};

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function bodyWordCount(scriptMd: string): number {
  return countWords(scriptMd);
}

function chapterCount(scriptMd: string): number {
  return (scriptMd.match(/^\d+\. \(\d+s\)/gm) ?? []).length;
}

/** Pull # Style / # Duration headers out of the existing scriptMd. */
function inferStyleAndDuration(scriptMd: string): {
  style: "typography" | "stock" | "carousel" | "long_form_essay";
  durationSeconds: number;
} {
  const styleMatch = scriptMd.match(/# Style\n([^\n]+)/);
  const durationMatch = scriptMd.match(/# Duration\n(\d+)s/);
  const rawStyle = (styleMatch?.[1] ?? "").trim();
  const validStyles = new Set(["typography", "stock", "carousel", "long_form_essay"]);
  const style = (validStyles.has(rawStyle) ? rawStyle : "typography") as
    | "typography"
    | "stock"
    | "carousel"
    | "long_form_essay";
  const durationSeconds = durationMatch ? Number(durationMatch[1]) : 60;
  return { style, durationSeconds };
}

function serialiseScriptToMd(
  s: Awaited<ReturnType<typeof generateScript>>,
  style: string,
): string {
  return [
    `# Style\n${style}`,
    `# Hook\n${s.hook}`,
    `# Body`,
    s.body.map((b, i) => `${i + 1}. (${b.seconds}s) ${b.text}`).join("\n"),
    `# CTA\n${s.cta}`,
    `# Caption\n${s.caption}`,
    `# Hashtags\n${s.hashtags.join(" ")}`,
    s.citationLine ? `# Citation\n${s.citationLine}` : "",
    `# Duration\n${s.durationSeconds}s`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin();
  if (guard instanceof NextResponse) return guard;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { reason, notes, role, autoRender } = parsed.data;

  const draft = await db.query.contentDrafts.findFirst({
    where: eq(contentDrafts.id, params.id),
  });
  if (!draft) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!draft.scriptMd) {
    return NextResponse.json(
      { error: "no_script", detail: "Draft has no scriptMd to rewrite." },
      { status: 409 },
    );
  }

  const actor = await getActor(req);
  const previousScriptMd = draft.scriptMd;
  const previousReviewerNotes = (draft.reviewerNotes ?? []) as ReviewerNote[];

  // 1) Append the new note (if any) BEFORE regenerating so the LLM sees it.
  let allNotes: ReviewerNote[] = [...previousReviewerNotes];
  if (reason) {
    const scrubbedNotes =
      typeof notes === "string"
        ? (scrubObject({ notes }) as { notes: string }).notes
        : undefined;
    const entry: ReviewerNote = {
      reason,
      notes: scrubbedNotes,
      by: hashForCorrelation(actor),
      role,
      ts: new Date().toISOString(),
    };
    allNotes = [...previousReviewerNotes, entry];
    await db
      .update(contentDrafts)
      .set({
        reviewerNotes: sql`coalesce(${contentDrafts.reviewerNotes}, '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb`,
      })
      .where(eq(contentDrafts.id, params.id));
    void recordAudit({
      actor,
      action: "draft_request_changes",
      meta: { draftId: params.id, reason, role, source: "rewrite-script" },
    });
  }

  // 2) Regenerate. If no notes have ever been added, return a 400 — there's
  //    nothing to act on. (UI should disable the button in that case.)
  if (allNotes.length === 0) {
    return NextResponse.json(
      {
        error: "no_feedback",
        detail:
          "Rewriting requires at least one reviewer note. Either append a note first or include reason + notes in this call.",
      },
      { status: 400 },
    );
  }

  const { style, durationSeconds } = inferStyleAndDuration(previousScriptMd);

  let newScript;
  try {
    newScript = await generateScript({
      brief: draft.brief,
      language: draft.language as "en" | "hi" | "hinglish",
      durationSeconds,
      style,
      reviewerFeedback: {
        previousScriptMd,
        // Strip server-only fields before passing to the LLM prompt.
        notes: allNotes.map((n) => ({ reason: n.reason, notes: n.notes })),
      },
    });
  } catch (e) {
    if (e instanceof ScriptRefusal) {
      return NextResponse.json(
        {
          error: "regeneration_refused",
          reason: e.reason,
          detail: (e as ScriptRefusal & { detail?: string }).detail,
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: "regeneration_failed", detail: String((e as Error).message).slice(0, 400) },
      { status: 502 },
    );
  }

  const newScriptMd = serialiseScriptToMd(newScript, style);

  await db
    .update(contentDrafts)
    .set({
      scriptMd: newScriptMd,
      status: "script_draft",
      videoUrl: null,
      voiceoverUrl: null,
      captionsSrt: null,
      clinicianReviewerId: null,
      editorReviewerId: null,
    })
    .where(eq(contentDrafts.id, params.id));

  void recordAudit({
    actor,
    action: "draft_script_regenerated",
    meta: {
      draftId: params.id,
      noteCount: allNotes.length,
      prevWords: bodyWordCount(previousScriptMd),
      newWords: bodyWordCount(newScriptMd),
      prevChapters: chapterCount(previousScriptMd),
      newChapters: chapterCount(newScriptMd),
      style,
      durationSeconds,
    },
  });

  let renderDispatched = false;
  let renderUrl: string | undefined;
  let renderError: string | undefined;
  if (autoRender) {
    const ghToken =
      process.env.GH_RENDER_TOKEN ||
      process.env.GH_AVATAR_TOKEN ||
      process.env.GITHUB_TOKEN;
    const ghRepo = process.env.GH_RENDER_REPO || process.env.GH_AVATAR_REPO;
    const ghBranch = process.env.GH_RENDER_BRANCH || "main";
    const workflowFile = "render-due.yml";
    if (!ghToken || !ghRepo) {
      renderError = "GH_RENDER_TOKEN / GH_RENDER_REPO not configured";
    } else {
      try {
        const dispatchUrl = `https://api.github.com/repos/${ghRepo}/actions/workflows/${workflowFile}/dispatches`;
        const r = await fetch(dispatchUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({
            ref: ghBranch,
            inputs: { draft_id: params.id, style: "" },
          }),
        });
        if (r.ok || r.status === 204) {
          renderDispatched = true;
          renderUrl = `https://github.com/${ghRepo}/actions/workflows/${workflowFile}`;
          void recordAudit({
            actor,
            action: "draft_render_dispatched",
            meta: { draftId: params.id, source: "rewrite-script", workflowFile },
          });
        } else {
          const t = await r.text().catch(() => "");
          renderError = `GH dispatch HTTP ${r.status}: ${t.slice(0, 200)}`;
        }
      } catch (e) {
        renderError = String((e as Error).message).slice(0, 200);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    draftId: params.id,
    appliedNoteCount: allNotes.length,
    newWordCount: bodyWordCount(newScriptMd),
    newChapterCount: chapterCount(newScriptMd),
    renderDispatched,
    renderUrl,
    renderError,
  });
}
