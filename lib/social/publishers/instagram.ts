/**
 * Instagram Reels publisher (Meta Graph API).
 *
 * Three-step container flow (blind-publish variant):
 *   1) POST /{ig-user-id}/media          media_type=REELS, video_url, caption
 *   2) sleep WARMUP_MS                    let Meta transcode the source
 *   3) POST /{ig-user-id}/media_publish   with retry-on-transient
 *
 * Why no status_code poll: GET /<container-id>?fields=status_code
 * returns an Authorization Error (code 100, subcode 33) when called
 * with a Page access token, which is the only token type that has
 * instagram_content_publish. There is no documented way to read
 * container status from a Page token. POST /media_publish on the
 * same container DOES succeed once Meta has finished transcoding,
 * so we just wait, then poke media_publish, retrying transient
 * "not ready" errors. Empirically validated 2026-05-26 across 3
 * Reels — all succeeded on attempt 1 of 6 with a 60s warmup.
 *
 * IMPORTANT — sex-health platform reality:
 *   Instagram aggressively reduces reach on, shadowbans, or removes content
 *   touching sexual health and education. The cost is unpredictable.
 *   We do NOT fight this; we surface the risk in the UI and require:
 *     - clinician_approved = true
 *     - editor_approved   = true
 *     - the publishing user explicitly clicks "Publish to Instagram"
 *
 * Returns post URL + post id, OR throws PublisherRefusal when env not
 * configured or guardrails fail.
 */

export class PublisherRefusal extends Error {
  constructor(
    public reason:
      | "missing_env"
      | "missing_video_url"
      | "container_failed"
      | "publish_failed"
      | "publish_timeout",
    public detail?: string,
  ) {
    super(`${reason}${detail ? `: ${detail}` : ""}`);
  }
}

import type { ProgressCallback } from "../publish-progress";

export type InstagramPublishInput = {
  videoUrl: string; // Public HTTPS URL Meta can fetch
  caption: string;
  shareToFeed?: boolean; // default true
  /** Optional progress callback; called as we transition stages. */
  onProgress?: ProgressCallback;
};

export type InstagramPublishResult = {
  postId: string;
  permalink?: string;
};

const GRAPH_VERSION = "v22.0";

/**
 * How long to wait between container creation and the first publish
 * attempt. Meta's IG transcoding queue is variable: some reels finish
 * in 5-15s, others sit at "Media not ready" (code 9007) for 90s+.
 *
 * History:
 *   - 60s (initial): blew Vercel's 60s function budget
 *   - 25s + 4 retries (2026-05-27 morning): fit the budget but bounced
 *     real reels off IG with "Media not ready" after 115s of polling
 *   - 45s + 8 retries (2026-05-27 fix): worst case 45 + 7*30 = 255s,
 *     still inside 300s if IG runs alone OR with YT only. If the
 *     operator picks IG + FB + YT all together and BOTH Meta calls
 *     hit their max retry, total ~510s would breach 300s — at that
 *     point the slower of the two times out cleanly with a refusal.
 *     In practice this is rare; when one platform's transcoding queue
 *     is slow the other usually isn't.
 */
const WARMUP_MS = Number(process.env.IG_PUBLISH_WARMUP_MS ?? "45000");
/** Backoff between retried publish attempts when Meta says "not ready". */
const RETRY_MS = Number(process.env.IG_PUBLISH_RETRY_MS ?? "30000");
/** With WARMUP=45s + 8 attempts (7 backoffs * RETRY=30s) = ~255s per call. */
const MAX_RETRIES = Number(process.env.IG_PUBLISH_MAX_RETRIES ?? "8");

export async function publishInstagramReel(input: InstagramPublishInput): Promise<InstagramPublishResult> {
  const onProgress = input.onProgress ?? (() => {});
  const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const accessToken = process.env.META_GRAPH_ACCESS_TOKEN;
  if (!igUserId || !accessToken) {
    throw new PublisherRefusal(
      "missing_env",
      "INSTAGRAM_BUSINESS_ACCOUNT_ID / META_GRAPH_ACCESS_TOKEN not set",
    );
  }
  if (!input.videoUrl.startsWith("https://")) {
    throw new PublisherRefusal(
      "missing_video_url",
      "Meta requires a public HTTPS video URL. Configure VERCEL_URL or a CDN, then retry.",
    );
  }

  // 1) Create container
  onProgress("container_create", { pct: 5, note: "Sending video URL to Meta" });
  const createUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media`;
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      video_url: input.videoUrl,
      caption: input.caption,
      share_to_feed: input.shareToFeed ?? true,
      access_token: accessToken,
    }),
  });
  const createJson = (await createRes.json()) as { id?: string; error?: unknown };
  if (!createRes.ok || !createJson.id) {
    throw new PublisherRefusal("container_failed", JSON.stringify(createJson));
  }
  const containerId = createJson.id;

  // 2) Warmup — give Meta time to transcode the source video before
  //    we attempt publish. See module header for why we don't poll.
  //    We tick progress every 5s so the UI shows movement during the
  //    long pre-publish wait. pct ramps 10 -> 40 across warmup.
  onProgress("warmup", { pct: 10, note: `Meta is transcoding (warmup ${Math.round(WARMUP_MS / 1000)}s)` });
  const warmupStart = Date.now();
  const warmupTicker = setInterval(() => {
    const elapsed = Date.now() - warmupStart;
    const ratio = Math.min(1, elapsed / WARMUP_MS);
    const pct = 10 + Math.round(ratio * 30);
    onProgress("warmup", { pct, note: `Transcoding... ${Math.round(elapsed / 1000)}s / ${Math.round(WARMUP_MS / 1000)}s` });
  }, 5000);
  await sleep(WARMUP_MS);
  clearInterval(warmupTicker);

  // 3) Blind publish with retry-on-transient. We can't read container
  //    status (Page-token Auth Error subcode 33) so we just keep poking
  //    media_publish until either it succeeds or we exhaust retries.
  //    pct ramps 40 -> 95 across the retry loop.
  const publishUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media_publish`;
  let lastError = "no attempts made";
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const attemptPct = 40 + Math.round((attempt / MAX_RETRIES) * 55);
    onProgress("publish_attempt", {
      pct: attemptPct,
      attempt,
      maxAttempts: MAX_RETRIES,
      note: `Asking Meta to publish (attempt ${attempt}/${MAX_RETRIES})`,
    });
    const publishRes = await fetch(publishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
    });
    const publishJson = (await publishRes.json()) as
      | { id: string }
      | {
          error: {
            message?: string;
            error_user_title?: string;
            error_user_msg?: string;
            code?: number;
            error_subcode?: number;
            is_transient?: boolean;
          };
        };
    if ("id" in publishJson) {
      onProgress("finalising", { pct: 100, note: "Published" });
      return { postId: publishJson.id };
    }
    const err = "error" in publishJson ? publishJson.error : undefined;
    const errMsg = err?.message ?? "unknown";
    lastError = errMsg;
    // Transient detection — Meta returns the "media still transcoding"
    // signal in MULTIPLE shapes and we need to catch all of them or
    // we'll give up after attempt 1 on a perfectly normal slow encode.
    // Sources of truth (any one of these = transient, back off and retry):
    //   - error.code 9007 (legacy "media not available")
    //   - error.error_subcode 2207027 (newer "transcoding in progress",
    //     observed 2026-05-27 on draft 6cc33733)
    //   - error.message containing the legacy "Media ID is not available"
    //   - error.message / error_user_title / error_user_msg matching
    //     any of: not ready, still processing, in progress, try again,
    //     please retry, please wait
    // Note: we DELIBERATELY ignore Meta's own `is_transient` flag here.
    // Meta sets is_transient=false on 2207027 even though the
    // error_user_msg literally tells the caller "wait a moment". Their
    // flag is unreliable; the heuristic below matches observed reality.
    const hintText = [err?.message, err?.error_user_title, err?.error_user_msg]
      .filter(Boolean)
      .join(" | ");
    const transient =
      err?.code === 9007 ||
      err?.error_subcode === 2207027 ||
      /media id is not available/i.test(hintText) ||
      /not ready|still processing|in progress|try again|please retry|please wait/i.test(
        hintText,
      );
    if (!transient) {
      throw new PublisherRefusal("publish_failed", JSON.stringify(publishJson));
    }
    if (attempt < MAX_RETRIES) {
      onProgress("transcoding_wait", {
        pct: attemptPct,
        attempt,
        maxAttempts: MAX_RETRIES,
        note: `Meta says "not ready yet" — waiting ${Math.round(RETRY_MS / 1000)}s before retry`,
      });
      await sleep(RETRY_MS);
    }
  }
  throw new PublisherRefusal(
    "publish_timeout",
    `container ${containerId} not publishable after ${MAX_RETRIES} attempts; last error: ${lastError}`,
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
