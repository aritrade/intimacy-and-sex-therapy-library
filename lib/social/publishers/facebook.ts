/**
 * Facebook Page Reels publisher (Meta Graph API v22.0).
 *
 * Posts the same 9:16 MP4 to your FB Page wall as a Reel. Mirrors the
 * Instagram publisher's blind-publish pattern, with the differences
 * called out in `publishFacebookReel()` below.
 *
 * Three-step flow (URL-hosted upload variant):
 *
 *   1) POST /{page-id}/video_reels?upload_phase=start
 *      Response: { video_id, upload_url }
 *
 *   2) POST <upload_url>
 *      Headers: Authorization=OAuth <token>, file_url=<public-https>
 *      Meta fetches the video from the URL we hand it. Returns
 *      { success: true } the moment they accept the URL — actual
 *      transcoding happens async on their side.
 *
 *   3) POST /{page-id}/video_reels?upload_phase=finish&video_state=PUBLISHED
 *      &video_id=...&description=...
 *      Returns { success: true, post_id } once Meta has finished
 *      transcoding. If they haven't, we get an "in_progress" error
 *      we treat as transient (same pattern as IG).
 *
 * Why the URL-hosted variant and not the binary upload variant:
 *   - We already host the rendered MP4 on Vercel Blob with a public
 *     HTTPS URL. Letting Meta fetch it directly skips a 50–100 MB
 *     upload from our Vercel function (which would push past the
 *     serverless timeout AND eat outbound bandwidth).
 *
 * Required env:
 *   - META_FACEBOOK_PAGE_ID
 *   - META_GRAPH_ACCESS_TOKEN  (Page access token with
 *                                pages_manage_posts scope — same
 *                                token IG already uses)
 *
 * IMPORTANT — sex-health platform reality:
 *   Facebook's content-moderation is stricter than Instagram's for
 *   sexual-health topics. We do NOT fight this; the surrounding
 *   approval gates (clinician + editor) plus explicit operator
 *   click are required before any FB publish call is made.
 */

export class FacebookPublisherRefusal extends Error {
  constructor(
    public reason:
      | "missing_env"
      | "missing_video_url"
      | "start_failed"
      | "upload_failed"
      | "finish_failed"
      | "publish_timeout",
    public detail?: string,
  ) {
    super(`${reason}${detail ? `: ${detail}` : ""}`);
  }
}

export type FacebookPublishInput = {
  videoUrl: string;
  description: string;
};

export type FacebookPublishResult = {
  postId: string;
  permalink?: string;
};

const GRAPH_VERSION = "v22.0";

/** Time to wait between upload-start success and the finish call. */
const WARMUP_MS = Number(process.env.FB_PUBLISH_WARMUP_MS ?? "60000");
/** Backoff between retried finish attempts when Meta says "in progress". */
const RETRY_MS = Number(process.env.FB_PUBLISH_RETRY_MS ?? "30000");
/** With WARMUP=60s + 6 retries * 30s = ~4 min total. Same envelope as IG. */
const MAX_RETRIES = Number(process.env.FB_PUBLISH_MAX_RETRIES ?? "6");

export function isFacebookConfigured(): boolean {
  return Boolean(
    process.env.META_FACEBOOK_PAGE_ID && process.env.META_GRAPH_ACCESS_TOKEN,
  );
}

export async function publishFacebookReel(
  input: FacebookPublishInput,
): Promise<FacebookPublishResult> {
  const pageId = process.env.META_FACEBOOK_PAGE_ID;
  const accessToken = process.env.META_GRAPH_ACCESS_TOKEN;
  if (!pageId || !accessToken) {
    throw new FacebookPublisherRefusal(
      "missing_env",
      "META_FACEBOOK_PAGE_ID / META_GRAPH_ACCESS_TOKEN not set",
    );
  }
  if (!input.videoUrl.startsWith("https://")) {
    throw new FacebookPublisherRefusal(
      "missing_video_url",
      "Meta requires a public HTTPS video URL. Configure BLOB_READ_WRITE_TOKEN and re-render.",
    );
  }

  // 1) Start the upload session.
  const startUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/video_reels?upload_phase=start&access_token=${encodeURIComponent(accessToken)}`;
  const startRes = await fetch(startUrl, { method: "POST" });
  const startJson = (await startRes.json()) as {
    video_id?: string;
    upload_url?: string;
    error?: unknown;
  };
  if (!startRes.ok || !startJson.video_id || !startJson.upload_url) {
    throw new FacebookPublisherRefusal(
      "start_failed",
      JSON.stringify(startJson).slice(0, 400),
    );
  }
  const videoId = startJson.video_id;
  const uploadUrl = startJson.upload_url;

  // 2) Hand Meta the URL — they fetch it from Blob themselves.
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${accessToken}`,
      file_url: input.videoUrl,
    },
  });
  const uploadJson = (await uploadRes.json().catch(() => ({}))) as {
    success?: boolean;
    error?: unknown;
  };
  if (!uploadRes.ok || uploadJson.success === false) {
    throw new FacebookPublisherRefusal(
      "upload_failed",
      JSON.stringify(uploadJson).slice(0, 400),
    );
  }

  // 3) Wait for transcoding, then blind-publish with retry-on-transient.
  await sleep(WARMUP_MS);

  // Description has a 2200 char limit on FB Reels. Long descriptions
  // are silently truncated by the API which makes debugging confusing;
  // pre-truncate so we have a deterministic body.
  const description = input.description.slice(0, 2150);

  let lastError = "no attempts made";
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const finishUrl =
      `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/video_reels` +
      `?upload_phase=finish&video_id=${encodeURIComponent(videoId)}` +
      `&video_state=PUBLISHED` +
      `&description=${encodeURIComponent(description)}` +
      `&access_token=${encodeURIComponent(accessToken)}`;
    const finishRes = await fetch(finishUrl, { method: "POST" });
    const finishJson = (await finishRes.json()) as
      | { success: true; post_id?: string }
      | { success: false; error?: { message: string } }
      | { error: { message: string } };

    if ("success" in finishJson && finishJson.success === true) {
      // Meta returns post_id when the publish has actually attached to
      // the wall. If absent (rare), fall back to the video_id, which
      // is enough to look the post up via /<id>?fields=permalink_url.
      return { postId: finishJson.post_id ?? videoId };
    }

    const errMsg =
      "error" in finishJson && finishJson.error
        ? finishJson.error.message
        : "unknown";
    lastError = errMsg;
    const transient =
      /in progress|in_progress|not ready|still processing|try again|please retry/i.test(
        errMsg,
      );
    if (!transient) {
      throw new FacebookPublisherRefusal(
        "finish_failed",
        JSON.stringify(finishJson).slice(0, 400),
      );
    }
    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_MS);
    }
  }
  throw new FacebookPublisherRefusal(
    "publish_timeout",
    `video ${videoId} still transcoding after ${MAX_RETRIES} attempts; last error: ${lastError}`,
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
