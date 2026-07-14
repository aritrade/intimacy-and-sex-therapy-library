/**
 * Render-artifact host adapter — uploads rendered MP4 / MP3 / PNG frames to
 * a publicly fetchable HTTPS URL so Meta's Graph API can pull the video and
 * YouTube can pull the thumbnail.
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
 * Backend selection (first configured wins):
 *   1. S3-compatible object store (Cloudflare R2, Backblaze B2, AWS S3, …)
 *      when the S3_* env vars are set. Preferred because R2 in particular
 *      has a free tier with ZERO egress fees — which directly removes the
 *      data-transfer drain that previously suspended our Vercel Blob store.
 *   2. Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set.
 *   3. Local public path (dev / not-configured). Publishers refuse it
 *      because it isn't HTTPS, which is the correct "not configured yet"
 *      behaviour.
 *
 * S3 env vars (all required to enable the S3 backend):
 *   - S3_ENDPOINT          e.g. https://<accountid>.r2.cloudflarestorage.com
 *   - S3_BUCKET            bucket name
 *   - S3_ACCESS_KEY_ID
 *   - S3_SECRET_ACCESS_KEY
 *   - S3_PUBLIC_BASE_URL   public read prefix, e.g. https://pub-xxxx.r2.dev
 *                          or a custom domain mapped to the bucket
 *   - S3_REGION            optional, defaults to "auto" (correct for R2)
 */

import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { createHash } from "node:crypto";

export type BlobHost = "s3" | "vercel-blob" | "local";

export type BlobUploadResult = {
  url: string;
  pathname: string;
  hosted: BlobHost;
};

const SAFE_FILENAME_RE = /[^a-zA-Z0-9._-]/g;

// Default cache lifetime for render artifacts (30 days). Re-renders write
// to the same path but lib/social/render.ts appends a ?v=<stamp>
// cache-buster, so a long TTL is safe and keeps repeat fetches on the CDN
// edge instead of re-billing origin egress.
const RENDER_CACHE_SECONDS = 60 * 60 * 24 * 30;
// Content-addressed shared assets never change for a given URL, so they can
// be cached effectively forever.
const IMMUTABLE_CACHE_SECONDS = 60 * 60 * 24 * 365;

// ---------------------------------------------------------------------------
// S3-compatible backend (Cloudflare R2 / Backblaze B2 / AWS S3)
// ---------------------------------------------------------------------------

type S3Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  region: string;
};

function s3Config(): S3Config | null {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    return null;
  }
  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    // Strip any trailing slash so we can join with `/${pathname}` cleanly.
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
    region: process.env.S3_REGION || "auto",
  };
}

// Memoise the client across calls within a single process (render run /
// serverless invocation) to avoid re-handshaking per object.
let s3ClientPromise: Promise<unknown> | null = null;
async function getS3Client(cfg: S3Config) {
  if (!s3ClientPromise) {
    s3ClientPromise = (async () => {
      const { S3Client } = await import("@aws-sdk/client-s3");
      return new S3Client({
        region: cfg.region,
        endpoint: cfg.endpoint,
        credentials: {
          accessKeyId: cfg.accessKeyId,
          secretAccessKey: cfg.secretAccessKey,
        },
        // R2 requires path-style addressing.
        forcePathStyle: true,
      });
    })();
  }
  return s3ClientPromise as Promise<import("@aws-sdk/client-s3").S3Client>;
}

function s3PublicUrl(cfg: S3Config, pathname: string): string {
  return `${cfg.publicBaseUrl}/${pathname}`;
}

/** Strip the public base + any query string back to the object key. */
function s3KeyFromUrl(cfg: S3Config, url: string): string {
  const noQuery = url.split("?")[0];
  const prefix = `${cfg.publicBaseUrl}/`;
  return noQuery.startsWith(prefix) ? noQuery.slice(prefix.length) : noQuery;
}

async function s3Put(
  cfg: S3Config,
  pathname: string,
  buffer: Buffer,
  contentType: string,
  cacheControlMaxAge: number,
): Promise<void> {
  const client = await getS3Client(cfg);
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: pathname,
      Body: buffer,
      ContentType: contentType,
      CacheControl: `public, max-age=${cacheControlMaxAge}`,
    }),
  );
}

async function s3Exists(cfg: S3Config, pathname: string): Promise<boolean> {
  const client = await getS3Client(cfg);
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    await client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: pathname }));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API — backend-agnostic
// ---------------------------------------------------------------------------

export async function uploadRenderArtifact(
  localPath: string,
  /**
   * Where in the namespace to put it. Use a stable prefix so we can find
   * and delete on takedown / TTL cleanup later. We prepend
   * `renders/<draftId>/` automatically.
   */
  draftId: string,
  /**
   * Override the filename. Defaults to the basename of localPath.
   */
  filename?: string,
  opts?: { cacheControlMaxAge?: number },
): Promise<BlobUploadResult> {
  const cleanFilename = (filename ?? basename(localPath)).replace(SAFE_FILENAME_RE, "_");
  const pathname = `renders/${draftId}/${cleanFilename}`;
  const contentType = mimeFor(cleanFilename);
  const maxAge = opts?.cacheControlMaxAge ?? RENDER_CACHE_SECONDS;

  const cfg = s3Config();
  if (cfg) {
    const buffer = await readFile(localPath);
    await s3Put(cfg, pathname, buffer, contentType, maxAge);
    return { url: s3PublicUrl(cfg, pathname), pathname, hosted: "s3" };
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    // Dev / not-configured path: surface the local public URL so the
    // renderer keeps working. Publishers will refuse it on missing HTTPS.
    const localPublicPath = localPath.replace(/^.*\/public/, "");
    return { url: localPublicPath, pathname, hosted: "local" };
  }

  const buffer = await readFile(localPath);
  // Lazy-import so the server bundle stays small when blob isn't used.
  const { put } = await import("@vercel/blob");
  const { url } = await put(pathname, buffer, {
    access: "public",
    contentType,
    addRandomSuffix: false,
    token,
    allowOverwrite: true,
    cacheControlMaxAge: maxAge,
  });
  return { url, pathname, hosted: "vercel-blob" };
}

/**
 * Upload an asset that is IDENTICAL across drafts (e.g. the narrator
 * portrait) to a single content-addressed path under `assets/`, reused
 * by every render instead of being re-copied into each draft's folder.
 *
 * Why this matters on a metered tier:
 *   - Storage: the persona portrait is the same ~0.5 MB PNG for every
 *     reel. Writing it to `renders/<draftId>/narrator.png` stored one
 *     copy PER draft; content-addressing collapses that to a single
 *     object no matter how many drafts reference it.
 *   - Transfer/ops: when the exact bytes already exist we skip the
 *     re-upload entirely (a cheap existence probe instead of a put), so
 *     the hourly render loop stops re-pushing the same portrait.
 *
 * The path is keyed by a content hash so a changed portrait gets a new
 * URL automatically (no stale-cache problem) and old copies fall out of
 * use. These objects live OUTSIDE the `renders/` prefix, so the prune
 * (which only scans `renders/`) never reclaims them.
 */
export async function uploadSharedAsset(
  localPath: string,
  filename?: string,
): Promise<BlobUploadResult> {
  const buffer = await readFile(localPath);
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const base = (filename ?? basename(localPath)).replace(SAFE_FILENAME_RE, "_");
  const ext = extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  const pathname = `assets/${stem}-${hash}${ext}`;
  const contentType = mimeFor(base);

  const cfg = s3Config();
  if (cfg) {
    // Dedupe: skip the upload when this exact content already exists.
    try {
      if (await s3Exists(cfg, pathname)) {
        return { url: s3PublicUrl(cfg, pathname), pathname, hosted: "s3" };
      }
    } catch {
      // Probe failure is non-fatal — fall through to an upload.
    }
    await s3Put(cfg, pathname, buffer, contentType, IMMUTABLE_CACHE_SECONDS);
    return { url: s3PublicUrl(cfg, pathname), pathname, hosted: "s3" };
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    const localPublicPath = localPath.replace(/^.*\/public/, "");
    return { url: localPublicPath, pathname, hosted: "local" };
  }

  const { put, list } = await import("@vercel/blob");
  try {
    const existing = await list({ prefix: pathname, limit: 1, token });
    const hit = existing.blobs.find((b) => b.pathname === pathname);
    if (hit) return { url: hit.url, pathname, hosted: "vercel-blob" };
  } catch {
    // Probe failure is non-fatal — fall through to a normal upload.
  }

  const { url } = await put(pathname, buffer, {
    access: "public",
    contentType,
    addRandomSuffix: false,
    token,
    allowOverwrite: true,
    cacheControlMaxAge: IMMUTABLE_CACHE_SECONDS,
  });
  return { url, pathname, hosted: "vercel-blob" };
}

/**
 * Best-effort delete of a single artifact by pathname (object key). Used by
 * takedown / GDPR deletion + the post-render voiceover cleanup. Silently
 * no-ops when no backend is configured or the object doesn't exist.
 */
export async function deleteRenderArtifact(pathname: string): Promise<void> {
  const cfg = s3Config();
  if (cfg) {
    try {
      const client = await getS3Client(cfg);
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: pathname }));
    } catch (e) {
      console.warn("[blob-host] s3 delete failed:", (e as Error).message);
    }
    return;
  }

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
 * List every render artifact currently stored (paginated under the
 * `renders/` prefix). Used by the scheduled prune to reconcile stored bytes
 * against the DB and reclaim space from already-published drafts. Throws
 * when no backend is configured — the caller (a maintenance job, never a
 * user request) is expected to require it.
 */
export async function listRenderArtifacts(
  token?: string,
  prefix = "renders/",
): Promise<StoredBlob[]> {
  const cfg = s3Config();
  if (cfg) {
    const client = await getS3Client(cfg);
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const out: StoredBlob[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: cfg.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        }),
      );
      for (const obj of page.Contents ?? []) {
        if (!obj.Key) continue;
        out.push({
          url: s3PublicUrl(cfg, obj.Key),
          pathname: obj.Key,
          size: obj.Size ?? 0,
          uploadedAt: obj.LastModified ?? new Date(0),
        });
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    return out;
  }

  const tok = token ?? process.env.BLOB_READ_WRITE_TOKEN;
  if (!tok) {
    throw new Error("No storage backend configured (set S3_* or BLOB_READ_WRITE_TOKEN)");
  }
  const { list } = await import("@vercel/blob");
  const out: StoredBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000, token: tok });
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
 * Bulk-delete artifacts by URL. We chunk to stay well under any request-size
 * ceiling. Best-effort per chunk so one bad URL doesn't abort the whole
 * prune. Returns the count actually deleted.
 */
export async function deleteBlobs(urls: string[], token?: string): Promise<number> {
  if (urls.length === 0) return 0;

  const cfg = s3Config();
  if (cfg) {
    const client = await getS3Client(cfg);
    const { DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
    const CHUNK = 1000; // S3 DeleteObjects hard limit per request.
    let deleted = 0;
    for (let i = 0; i < urls.length; i += CHUNK) {
      const batch = urls.slice(i, i + CHUNK).map((u) => ({ Key: s3KeyFromUrl(cfg, u) }));
      try {
        const res = await client.send(
          new DeleteObjectsCommand({
            Bucket: cfg.bucket,
            Delete: { Objects: batch, Quiet: true },
          }),
        );
        deleted += batch.length - (res.Errors?.length ?? 0);
      } catch (e) {
        console.warn("[blob-host] s3 bulk delete chunk failed:", (e as Error).message);
      }
    }
    return deleted;
  }

  const tok = token ?? process.env.BLOB_READ_WRITE_TOKEN;
  if (!tok) return 0;
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

/**
 * Immediately reclaim ALL render artifacts for a single draft (the whole
 * `renders/<draftId>/` folder). Called the instant a post is confirmed live on
 * its platform, so the 1GB store frees up for the next render without waiting
 * for the hourly prune. Best-effort: never throws, returns what it freed.
 */
export async function reclaimDraftRenderBlobs(
  draftId: string,
): Promise<{ deleted: number; bytes: number }> {
  try {
    const blobs = await listRenderArtifacts(undefined, `renders/${draftId}/`);
    if (blobs.length === 0) return { deleted: 0, bytes: 0 };
    const bytes = blobs.reduce((acc, b) => acc + b.size, 0);
    const deleted = await deleteBlobs(blobs.map((b) => b.url));
    return { deleted, bytes };
  } catch (e) {
    console.warn("[blob-host] reclaimDraftRenderBlobs failed:", (e as Error).message);
    return { deleted: 0, bytes: 0 };
  }
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

/** True when any HTTPS-capable storage backend (S3 or Vercel Blob) is set. */
export function isBlobConfigured(): boolean {
  return !!s3Config() || !!process.env.BLOB_READ_WRITE_TOKEN;
}
