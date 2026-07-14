/**
 * Post-publish verification + immediate blob reclamation.
 *
 * The rule this enforces: the moment a draft is posted, we confirm the post is
 * actually LIVE on the platform (not just that the upload call returned an id),
 * and only then delete that draft's render artifacts from blob storage — freeing
 * the 1GB store for the next batch instead of waiting for the hourly prune.
 *
 * Verification is a read-only, near-free API call per platform (e.g. YouTube's
 * videos.list is 1 quota unit). If a platform can't be verified we KEEP the
 * blob (the hourly prune is the backstop) so we never delete the only copy of a
 * video that didn't actually publish.
 */

import { getYouTubeAccessToken } from "./publishers/youtube-oauth";
import { reclaimDraftRenderBlobs } from "./blob-host";

export type VerifyReclaimResult = {
  verified: boolean;
  reclaimed: { deleted: number; bytes: number };
  checks: Array<{ platform: string; ok: boolean; detail?: string }>;
};

/**
 * Confirm a YouTube video id resolves to a real, non-rejected upload on the
 * authenticated channel. `uploaded`/`processed` both mean it's live enough to
 * drop our source copy; `failed`/`rejected`/`deleted` (or a missing item) mean
 * keep the blob.
 */
export async function verifyYouTubePosted(
  videoId: string,
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const token = await getYouTubeAccessToken();
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(videoId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      return { ok: false, detail: `videos.list ${res.status}` };
    }
    const j = (await res.json()) as {
      items?: Array<{ status?: { uploadStatus?: string } }>;
    };
    const status = j.items?.[0]?.status?.uploadStatus;
    if (!status) return { ok: false, detail: "video id not found on channel" };
    if (status === "uploaded" || status === "processed") return { ok: true, detail: status };
    return { ok: false, detail: `uploadStatus=${status}` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

/**
 * Verify every VIDEO platform this draft was posted to, then reclaim the draft's
 * render blobs iff all such verifications pass. Text-only cross-posts
 * (LinkedIn/Twitter) don't consume the video blob, so they don't gate deletion.
 * Never throws — a verification/deletion hiccup just leaves the blob for the
 * hourly prune.
 */
export async function verifyPostedAndReclaim(
  draftId: string,
  platformPostIds: Record<string, string>,
): Promise<VerifyReclaimResult> {
  const checks: VerifyReclaimResult["checks"] = [];

  if (platformPostIds.youtube) {
    const r = await verifyYouTubePosted(platformPostIds.youtube);
    checks.push({ platform: "youtube", ok: r.ok, detail: r.detail });
  }
  // NOTE: when IG/FB return to the rollout, add Graph API existence checks here
  // (GET /{ig-media-id} / /{fb-post-id}). Until then only YouTube gates.

  // Only reclaim when we actually verified at least one video platform AND all
  // verified. No video-platform checks (e.g. a LinkedIn-only post) => nothing to
  // reclaim here; the prune handles any stragglers.
  const verified = checks.length > 0 && checks.every((c) => c.ok);
  if (!verified) {
    return { verified: false, reclaimed: { deleted: 0, bytes: 0 }, checks };
  }

  const reclaimed = await reclaimDraftRenderBlobs(draftId);
  return { verified: true, reclaimed, checks };
}
