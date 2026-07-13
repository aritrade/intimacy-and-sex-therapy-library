/**
 * Reclaim Vercel Blob space by deleting render artifacts that are no longer
 * needed (drafts already `posted` past the grace window, `taken_down`, or
 * orphaned). Called from `.github/workflows/prune-blobs.yml`; also runnable
 * by hand.
 *
 * The free Hobby Blob tier is a hard 1 GB. Without this, the store fills and
 * EVERY render fails at the upload step, which silently halts the whole
 * content pipeline (the draft's video_url never lands, so it re-renders
 * forever). See lib/social/blob-prune.ts for the full rationale.
 *
 *   npx tsx scripts/prune-render-blobs.ts                 # real delete
 *   DRY_RUN=1 npx tsx scripts/prune-render-blobs.ts       # preview only
 *   PRUNE_GRACE_HOURS=72 npx tsx scripts/prune-render-blobs.ts
 *   npx tsx scripts/prune-render-blobs.ts --dry-run
 */
import "dotenv/config";
import { pruneRenderBlobs } from "../lib/social/blob-prune";
import { isBlobConfigured } from "../lib/social/blob-host";

const MB = (bytes: number) => (bytes / 1048576).toFixed(1);

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[prune-blobs] DATABASE_URL is not set — refusing to run.");
    process.exit(2);
  }
  if (!isBlobConfigured()) {
    console.error(
      "[prune-blobs] no storage backend configured (set S3_* or BLOB_READ_WRITE_TOKEN) — nothing to prune.",
    );
    process.exit(2);
  }

  const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
  console.log(`[prune-blobs] mode=${dryRun ? "DRY-RUN (no deletes)" : "DELETE"}`);

  const r = await pruneRenderBlobs({ dryRun });

  console.log(
    `[prune-blobs] store: ${r.totalBlobs} blobs, ${MB(r.totalBytes)} MB of 1024 MB ` +
      `(grace=${r.graceHours}h)`,
  );

  const reclaimable = r.drafts.filter((d) => d.willDelete);
  if (reclaimable.length === 0) {
    console.log("[prune-blobs] nothing reclaimable — exiting clean.");
  } else {
    console.log(`[prune-blobs] reclaimable drafts (${reclaimable.length}):`);
    for (const d of reclaimable.slice(0, 40)) {
      console.log(
        `  ${d.willDelete ? (dryRun ? "WOULD-DEL" : "DELETED  ") : "kept     "} ` +
          `${MB(d.bytes).padStart(7)} MB  ${d.draftId}  (${d.reason}, ${d.blobCount} files)`,
      );
    }
    if (reclaimable.length > 40) console.log(`  …and ${reclaimable.length - 40} more`);
  }

  console.log(
    `[prune-blobs] DONE — ${dryRun ? "would free" : "freed"} ${MB(r.freedBytes)} MB ` +
      `(${r.deletedBlobs} blobs); ${MB(r.keptBytes)} MB kept across in-flight drafts.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("[prune-blobs] FATAL:", (e as Error).message);
  console.error((e as Error).stack);
  process.exit(1);
});
