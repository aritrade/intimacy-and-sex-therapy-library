/**
 * Scheduled garbage-collection for render artifacts in Vercel Blob.
 *
 * Why this exists
 * ---------------
 * Every render writes `renders/<draftId>/{video.mp4,voiceover.*,narrator.png}`
 * to Vercel Blob (see lib/social/blob-host.ts) and NOTHING ever deleted them.
 * On the free Hobby plan that's a hard 1 GB ceiling. Once full, every render
 * fails at the upload step ("Storage quota exceeded for Hobby plan (1GB
 * maximum)"), and since lib/social/render.ts refuses to persist a non-HTTPS
 * fallback, the draft's `video_url` stays NULL and it re-renders forever —
 * burning GH Actions minutes while no new video ever lands. That is the
 * failure mode this module prevents.
 *
 * What it deletes
 * ---------------
 * A draft's blob folder is reclaimable once the video no longer needs to be
 * pulled by anything:
 *
 *   - status `posted`      → the reel is live on IG / YouTube / FB, which host
 *                            their own copy. Our blob is now redundant.
 *   - status `taken_down`  → intentionally pulled; keeping the bytes is waste.
 *   - orphaned folder      → a `renders/<id>/` whose <id> matches no draft row
 *                            (e.g. a draft deleted by a forget-me / GDPR flow).
 *
 * Everything still in flight is KEPT:
 *   script_draft, clinician_reviewed, rendered, editor_reviewed, scheduled —
 *   these may still be previewed in the admin queue or published.
 *
 * The grace window
 * ----------------
 * Publishing is partial-success-aware: an operator can re-click "publish" to
 * add a platform that failed the first time, and that re-publish re-pulls the
 * blob. So we only reclaim a `posted` draft once it's been posted longer than
 * `graceHours` (default 48h) — long enough that any partial-recovery or
 * additive cross-post is done. Orphans have no such window.
 */

import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts } from "@/lib/db/schema";
import { listRenderArtifacts, deleteBlobs, type StoredBlob } from "./blob-host";
import { recordAudit } from "@/lib/observability/audit";

/** Statuses whose render bytes are safe to reclaim (after the grace window). */
const RECLAIMABLE_STATUSES = new Set(["posted", "taken_down"]);

export type DraftPrunePlan = {
  draftId: string;
  status: string | "orphan";
  reason: "posted" | "taken_down" | "orphan" | "keep";
  blobCount: number;
  bytes: number;
  willDelete: boolean;
  urls: string[];
};

export type PruneResult = {
  dryRun: boolean;
  graceHours: number;
  totalBlobs: number;
  totalBytes: number;
  deletedBlobs: number;
  freedBytes: number;
  keptBytes: number;
  drafts: DraftPrunePlan[];
};

function draftIdFromPathname(pathname: string): string | null {
  // pathname looks like "renders/<draftId>/<file>"
  const parts = pathname.split("/");
  if (parts[0] !== "renders" || parts.length < 2 || !parts[1]) return null;
  return parts[1];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function pruneRenderBlobs(opts?: {
  graceHours?: number;
  dryRun?: boolean;
  token?: string;
}): Promise<PruneResult> {
  const graceHours = Math.max(0, opts?.graceHours ?? Number(process.env.PRUNE_GRACE_HOURS ?? 48));
  const dryRun = opts?.dryRun ?? false;
  const graceCutoff = new Date(Date.now() - graceHours * 3600_000);

  const blobs = await listRenderArtifacts(opts?.token);

  // Group blobs by draftId. Anything not under renders/<id>/ is left alone.
  const byDraft = new Map<string, StoredBlob[]>();
  for (const b of blobs) {
    const id = draftIdFromPathname(b.pathname);
    if (!id) continue;
    const arr = byDraft.get(id);
    if (arr) arr.push(b);
    else byDraft.set(id, [b]);
  }

  // Look up status + postedAt for every referenced draft in one query.
  // Only UUID-shaped folder names can match a draft row; anything else
  // (e.g. a `renders/smoke-test/` left over from a manual render) is an
  // orphan by definition, and feeding it to a `uuid` column would throw
  // "invalid input syntax for type uuid", so we exclude it from the query
  // and let it fall through to the orphan branch below.
  const draftIds = [...byDraft.keys()].filter((id) => UUID_RE.test(id));
  const rows =
    draftIds.length > 0
      ? await db
          .select({
            id: contentDrafts.id,
            status: contentDrafts.status,
            postedAt: contentDrafts.postedAt,
          })
          .from(contentDrafts)
          .where(inArray(contentDrafts.id, draftIds))
      : [];
  const draftById = new Map(rows.map((r) => [r.id, r]));

  const plans: DraftPrunePlan[] = [];
  for (const [draftId, draftBlobs] of byDraft) {
    const bytes = draftBlobs.reduce((acc, b) => acc + b.size, 0);
    const row = draftById.get(draftId);

    let reason: DraftPrunePlan["reason"] = "keep";
    let willDelete = false;

    if (!row) {
      reason = "orphan";
      willDelete = true;
    } else if (RECLAIMABLE_STATUSES.has(row.status)) {
      // `posted` honours the grace window; `taken_down` is immediate.
      const pastGrace =
        row.status === "taken_down" || !row.postedAt || row.postedAt < graceCutoff;
      reason = row.status as "posted" | "taken_down";
      willDelete = pastGrace;
    }

    plans.push({
      draftId,
      status: row?.status ?? "orphan",
      reason,
      blobCount: draftBlobs.length,
      bytes,
      willDelete,
      urls: draftBlobs.map((b) => b.url),
    });
  }

  // Biggest reclaimable folders first so a partial run frees the most space.
  plans.sort((a, b) => Number(b.willDelete) - Number(a.willDelete) || b.bytes - a.bytes);

  const toDelete = plans.filter((p) => p.willDelete);
  const urlsToDelete = toDelete.flatMap((p) => p.urls);
  const freedBytes = toDelete.reduce((acc, p) => acc + p.bytes, 0);
  const totalBytes = blobs.reduce((acc, b) => acc + b.size, 0);

  let deletedBlobs = 0;
  if (!dryRun && urlsToDelete.length > 0) {
    deletedBlobs = await deleteBlobs(urlsToDelete, opts?.token);
  }

  const result: PruneResult = {
    dryRun,
    graceHours,
    totalBlobs: blobs.length,
    totalBytes,
    deletedBlobs: dryRun ? urlsToDelete.length : deletedBlobs,
    freedBytes,
    keptBytes: totalBytes - freedBytes,
    drafts: plans,
  };

  void recordAudit({
    actor: "cron:gh-actions",
    action: "blob_prune",
    meta: {
      dryRun,
      graceHours,
      totalBlobs: result.totalBlobs,
      totalMB: +(totalBytes / 1048576).toFixed(1),
      deletedBlobs: result.deletedBlobs,
      freedMB: +(freedBytes / 1048576).toFixed(1),
      draftsReclaimed: toDelete.length,
      byReason: toDelete.reduce<Record<string, number>>((acc, p) => {
        acc[p.reason] = (acc[p.reason] ?? 0) + 1;
        return acc;
      }, {}),
    },
  });

  return result;
}
