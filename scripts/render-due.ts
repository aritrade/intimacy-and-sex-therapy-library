/**
 * Batch-render every draft that needs a video, called from the
 * `.github/workflows/render-due.yml` workflow.
 *
 * Selection criteria — by default we look at:
 *   - status IN any non-terminal state (script_draft, clinician_reviewed,
 *     rendered, editor_reviewed, scheduled) — see RENDERABLE_STATUSES
 *   - video_url IS NULL
 *   - LIMIT RENDER_DUE_BATCH (default 5)
 *
 * The status set is intentionally broad so a draft that advanced to
 * editor_reviewed / scheduled while its render kept failing (NULL video_url)
 * still gets healed — the old {script_draft, clinician_reviewed}-only scan
 * left those permanently stuck (un-publishable AND never re-rendered).
 *
 * Why we render BEFORE clinician approval: it lets the clinician see a
 * video preview alongside the script in /admin/queue, which makes their
 * "approve / reject" call more informed. The status guardrail still
 * holds — rendering a `script_draft` keeps it at `script_draft` (see
 * lib/social/render-and-persist.ts PRESERVE_STATUSES).
 *
 * If the workflow was triggered via `workflow_dispatch` with a specific
 * `draft_id` input (the admin "Render" button), we render just that one,
 * regardless of status — operators sometimes want to force a re-render
 * of a posted video to fix something quickly.
 *
 *   npx tsx scripts/render-due.ts                       # batch mode
 *   DRAFT_ID=<id> npx tsx scripts/render-due.ts         # single-draft
 *   STYLE=stock DRAFT_ID=<id> npx tsx scripts/render-due.ts
 */
import "dotenv/config";
import { and, eq, inArray, isNull, desc } from "drizzle-orm";
import { db } from "../lib/db/client";
import { contentDrafts } from "../lib/db/schema";
import {
  renderDraftAndPersist,
  RenderPersistError,
} from "../lib/social/render-and-persist";
import { recordAudit } from "../lib/observability/audit";
import type { RenderInput } from "../lib/social/render";

const BATCH_LIMIT = Number(process.env.RENDER_DUE_BATCH ?? "5");
const KNOWN_STYLES = ["typography", "stock", "photo", "avatar", "long_form_essay"] as const;

/**
 * Every non-terminal status that can legitimately be missing a video and
 * therefore needs a (re-)render. This is deliberately broader than the
 * original {script_draft, clinician_reviewed}: a draft can reach
 * `editor_reviewed` / `scheduled` while its render keeps failing (e.g. the
 * Vercel Blob store was full), which leaves it approved-for-publish but with
 * a NULL video_url — un-publishable AND invisible to the old batch scan, so
 * it gets stuck forever. render-and-persist preserves these statuses
 * (PRESERVE_STATUSES) so re-rendering only attaches the missing video without
 * touching approvals or review gates. Terminal/handled-elsewhere statuses
 * (posted, taken_down, failed) are intentionally excluded.
 */
const RENDERABLE_STATUSES = [
  "script_draft",
  "clinician_reviewed",
  "rendered",
  "editor_reviewed",
  "scheduled",
] as const;

type Style = NonNullable<RenderInput["style"]>;

function parseStyle(s: string | undefined): Style | undefined {
  if (!s) return undefined;
  if ((KNOWN_STYLES as readonly string[]).includes(s)) return s as Style;
  console.warn(`[render-due] unknown STYLE='${s}', ignoring (defaults to "photo")`);
  return undefined;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[render-due] DATABASE_URL is not set");
    process.exit(2);
  }

  const explicitId = process.env.DRAFT_ID?.trim();
  const style = parseStyle(process.env.STYLE?.trim());

  let drafts: { id: string; status: string }[];
  if (explicitId) {
    const row = await db
      .select({ id: contentDrafts.id, status: contentDrafts.status })
      .from(contentDrafts)
      .where(eq(contentDrafts.id, explicitId))
      .limit(1);
    if (!row.length) {
      console.error(`[render-due] draft ${explicitId} not found`);
      process.exit(1);
    }
    drafts = row;
    console.log(`[render-due] mode=single draftId=${explicitId} status=${drafts[0].status}`);
  } else {
    drafts = await db
      .select({ id: contentDrafts.id, status: contentDrafts.status })
      .from(contentDrafts)
      .where(
        and(
          inArray(contentDrafts.status, [...RENDERABLE_STATUSES]),
          isNull(contentDrafts.videoUrl),
        ),
      )
      .orderBy(desc(contentDrafts.createdAt))
      .limit(BATCH_LIMIT);
    console.log(`[render-due] mode=batch found=${drafts.length} (limit=${BATCH_LIMIT})`);
  }

  if (drafts.length === 0) {
    console.log("[render-due] nothing to render — exiting clean");
    void recordAudit({
      actor: "cron:gh-actions",
      action: "render_due_cron",
      meta: { mode: "batch", scanned: 0, rendered: 0, failed: 0 },
    });
    process.exit(0);
  }

  let rendered = 0;
  let failed = 0;
  const results: Array<{ id: string; ok: boolean; reason?: string }> = [];

  for (const d of drafts) {
    const started = Date.now();
    console.log(`\n[render-due] === ${d.id} (status=${d.status}) ===`);
    try {
      const r = await renderDraftAndPersist(d.id, { style });
      const took = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `[render-due] ${d.id} OK in ${took}s: ${r.fromStatus} -> ${r.toStatus}, ${r.render.totalSeconds.toFixed(1)}s video at ${r.render.publicVideoUrl}`,
      );
      rendered += 1;
      results.push({ id: d.id, ok: true });
    } catch (e) {
      const reason =
        e instanceof RenderPersistError
          ? `${e.reason}${e.detail ? `:${e.detail}` : ""}`
          : (e as Error).message;
      console.error(`[render-due] ${d.id} FAILED: ${reason}`);
      failed += 1;
      results.push({ id: d.id, ok: false, reason });
    }
  }

  void recordAudit({
    actor: explicitId ? "admin:render-button" : "cron:gh-actions",
    action: "render_due_cron",
    meta: {
      mode: explicitId ? "single" : "batch",
      scanned: drafts.length,
      rendered,
      failed,
      results,
    },
  });

  console.log(`\n[render-due] DONE — rendered=${rendered} failed=${failed} scanned=${drafts.length}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[render-due] FATAL:", (e as Error).message);
  console.error((e as Error).stack);
  process.exit(1);
});
