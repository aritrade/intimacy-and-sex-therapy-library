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

export type InstagramPublishInput = {
  videoUrl: string; // Public HTTPS URL Meta can fetch
  caption: string;
  shareToFeed?: boolean; // default true
};

export type InstagramPublishResult = {
  postId: string;
  permalink?: string;
};

const GRAPH_VERSION = "v22.0";

/**
 * How long to wait between container creation and the first publish
 * attempt. Empirically Meta finishes transcoding our 37-42s portrait
 * Reels in 5-15s, so 25s is plenty for the happy path; retries cover
 * the long tail.
 *
 * Tuned down from 60s on 2026-05-27 after a 504 timeout on the manual
 * publish route: serial IG + FB + YT all running under one 300s budget
 * doesn't tolerate 60s of pure sleep per Meta call.
 */
const WARMUP_MS = Number(process.env.IG_PUBLISH_WARMUP_MS ?? "25000");
/** Backoff between retried publish attempts when Meta says "not ready". */
const RETRY_MS = Number(process.env.IG_PUBLISH_RETRY_MS ?? "30000");
/**
 * Cap on retries. With WARMUP=25s + 4 attempts (3 backoffs * RETRY=30s)
 * we give Meta up to ~115s per IG call. Combined with FB (~115s) and YT
 * (~30s) serial, worst case ~260s, still within Vercel Pro's 300s
 * function budget.
 */
const MAX_RETRIES = Number(process.env.IG_PUBLISH_MAX_RETRIES ?? "4");

export async function publishInstagramReel(input: InstagramPublishInput): Promise<InstagramPublishResult> {
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
  await sleep(WARMUP_MS);

  // 3) Blind publish with retry-on-transient. We can't read container
  //    status (Page-token Auth Error subcode 33) so we just keep poking
  //    media_publish until either it succeeds or we exhaust retries.
  const publishUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media_publish`;
  let lastError = "no attempts made";
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const publishRes = await fetch(publishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
    });
    const publishJson = (await publishRes.json()) as
      | { id: string }
      | { error: { message: string } };
    if ("id" in publishJson) {
      return { postId: publishJson.id };
    }
    const errMsg = "error" in publishJson ? publishJson.error.message : "unknown";
    lastError = errMsg;
    // Heuristic: anything that mentions "not ready" / "still processing"
    // / "in progress" / "try again" is a transient transcoding-not-done
    // signal — back off and retry. Anything else (auth, validation,
    // duplicate-post, rate-limit) is terminal — fail fast so the caller
    // surfaces the actual issue instead of timing out at MAX_RETRIES.
    const transient = /not ready|still processing|in progress|try again|please retry/i.test(errMsg);
    if (!transient) {
      throw new PublisherRefusal("publish_failed", JSON.stringify(publishJson));
    }
    if (attempt < MAX_RETRIES) {
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
