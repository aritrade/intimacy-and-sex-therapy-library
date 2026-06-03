/**
 * Vercel Blob host adapter — uploads rendered MP4 / MP3 / PNG carousel
 * frames to a publicly fetchable HTTPS URL so Meta's Graph API can
 * pull the video and YouTube can pull the thumbnail.
 *
 * Why we need this:
 *   - Vercel's serverless filesystem is ephemeral; a video written to
 *     `/public/renders/<id>/video.mp4` during a render run is GONE on
 *     the next request because each invocation lands on a fresh
 *     container with /tmp wiped.
 *   - Instagram's `media_url` parameter requires a public HTTPS URL
 *     that returns 200 with a video/* mime for ~30 seconds while Meta
 *     pulls it server-side. Local file paths and signed-URL flows
 *     don't work.
 *
 * The free Vercel Blob tier (1 GB storage, 10 GB egress/month) is
 * generous for our volume: ~5 MB/reel × 5/day × 30 days = 750 MB.
 *
 * Falls back gracefully when `BLOB_READ_WRITE_TOKEN` is unset:
 *   - Returns the local public path the renderer already produces.
 *   - This is the dev-mode path; publishers will refuse it because it
 *     isn't HTTPS, which is the correct behaviour for "not configured
 *     yet."
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export type BlobUploadResult = {
  url: string;
  pathname: string;
  hosted: "vercel-blob" | "local";
};

const SAFE_FILENAME_RE = /[^a-zA-Z0-9._-]/g;

export async function uploadRenderArtifact(
  localPath: string,
  /**
   * Where in the Blob namespace to put it. Use a stable prefix so we
   * can find and delete on takedown / TTL cleanup later. We prepend
   * `renders/<draftId>/` automatically.
   */
  draftId: string,
  /**
   * Override the filename. Defaults to the basename of localPath.
   */
  filename?: string,
): Promise<BlobUploadResult> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const cleanFilename = (filename ?? basename(localPath)).replace(SAFE_FILENAME_RE, "_");
  const pathname = `renders/${draftId}/${cleanFilename}`;

  if (!token) {
    // Dev / not-configured path: surface the local public URL so the
    // renderer keeps working. Publishers will refuse on missing HTTPS.
    const localPublicPath = localPath.replace(/^.*\/public/, "");
    return {
      url: localPublicPath,
      pathname,
      hosted: "local",
    };
  }

  const buffer = await readFile(localPath);
  const contentType = mimeFor(cleanFilename);

  // Lazy-import so the server bundle stays small when blob isn't used.
  const { put } = await import("@vercel/blob");
  const { url } = await put(pathname, buffer, {
    access: "public",
    contentType,
    addRandomSuffix: false,
    token,
    allowOverwrite: true,
  });
  return { url, pathname, hosted: "vercel-blob" };
}

/**
 * Best-effort delete from Vercel Blob. Used by takedown / GDPR
 * deletion workflows. Silently no-ops when token is missing or the
 * blob doesn't exist.
 */
export async function deleteRenderArtifact(pathname: string): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return;
  try {
    const { del } = await import("@vercel/blob");
    await del(pathname, { token });
  } catch (e) {
    // Don't throw on takedown — best-effort.
    console.warn("[blob-host] delete failed:", (e as Error).message);
  }
}

export type StoredBlob = {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: Date;
};

/**
 * List every render artifact currently in the Blob store (paginated
 * under the `renders/` prefix). Used by the scheduled prune to reconcile
 * stored bytes against the DB and reclaim space from already-published
 * drafts. Throws when the token is missing — the caller (a maintenance
 * job, never a user request) is expected to require it.
 */
export async function listRenderArtifacts(token?: string): Promise<StoredBlob[]> {
  const tok = token ?? process.env.BLOB_READ_WRITE_TOKEN;
  if (!tok) throw new Error("BLOB_READ_WRITE_TOKEN is required to list blobs");
  const { list } = await import("@vercel/blob");
  const out: StoredBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "renders/", cursor, limit: 1000, token: tok });
    for (const b of page.blobs) {
      out.push({
        url: b.url,
        pathname: b.pathname,
        size: b.size,
        uploadedAt: b.uploadedAt,
      });
    }
    cursor = page.cursor;
  } while (cursor);
  return out;
}

/**
 * Bulk-delete blobs by URL. `del` accepts an array; we chunk to stay
 * well under any request-size ceiling. Best-effort per chunk so one bad
 * URL doesn't abort the whole prune. Returns the count actually deleted.
 */
export async function deleteBlobs(urls: string[], token?: string): Promise<number> {
  const tok = token ?? process.env.BLOB_READ_WRITE_TOKEN;
  if (!tok || urls.length === 0) return 0;
  const { del } = await import("@vercel/blob");
  const CHUNK = 100;
  let deleted = 0;
  for (let i = 0; i < urls.length; i += CHUNK) {
    const batch = urls.slice(i, i + CHUNK);
    try {
      await del(batch, { token: tok });
      deleted += batch.length;
    } catch (e) {
      console.warn("[blob-host] bulk delete chunk failed:", (e as Error).message);
    }
  }
  return deleted;
}

function mimeFor(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".srt")) return "application/x-subrip";
  return "application/octet-stream";
}

export function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}
