/**
 * Instagram Reels publisher (Meta Graph API).
 *
 * Two-step container flow:
 *   1) POST /{ig-user-id}/media           media_type=REELS, video_url, caption
 *   2) GET  /{container-id}?fields=status_code  (poll until FINISHED)
 *   3) POST /{ig-user-id}/media_publish   creation_id=<container-id>
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
      | "not_finished",
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

export async function publishInstagramReel(input: InstagramPublishInput): Promise<InstagramPublishResult> {
  const igUserId = process.env.IG_USER_ID;
  const accessToken = process.env.IG_ACCESS_TOKEN;
  if (!igUserId || !accessToken) {
    throw new PublisherRefusal("missing_env", "IG_USER_ID / IG_ACCESS_TOKEN not set");
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

  // 2) Poll status
  const containerId = createJson.id;
  const finished = await pollContainer(containerId, accessToken);
  if (!finished) throw new PublisherRefusal("not_finished", "container did not reach FINISHED in 90s");

  // 3) Publish
  const publishUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media_publish`;
  const publishRes = await fetch(publishUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
  });
  const publishJson = (await publishRes.json()) as { id?: string; error?: unknown };
  if (!publishRes.ok || !publishJson.id) {
    throw new PublisherRefusal("publish_failed", JSON.stringify(publishJson));
  }

  return { postId: publishJson.id };
}

async function pollContainer(containerId: string, token: string): Promise<boolean> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${containerId}?fields=status_code&access_token=${token}`;
  for (let i = 0; i < 30; i++) {
    const res = await fetch(url);
    const j = (await res.json()) as { status_code?: string };
    if (j.status_code === "FINISHED") return true;
    if (j.status_code === "ERROR") return false;
    await sleep(3000);
  }
  return false;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
