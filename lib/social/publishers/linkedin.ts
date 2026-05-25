/**
 * LinkedIn UGC publisher.
 *
 * Posts a text update (with an optional shared link) to a LinkedIn
 * organisation page. We deliberately don't upload native video here —
 * LinkedIn's API requires the larger /assets binary upload flow, the
 * audience overlap with our IG/YT viewers is small, and a curated
 * link-back to /blog gives us 80% of the SEO benefit.
 *
 * Required env:
 *   LINKEDIN_ORG_URN           urn:li:organization:<id>
 *   LINKEDIN_ACCESS_TOKEN      OAuth access token with w_organization_social
 *
 * Refusal policy is identical to the IG / YT publishers: missing env
 * means we throw a typed refusal so callers can record it as
 * "not_configured" in the audit log instead of treating it as an error.
 */

export class LinkedInPublisherRefusal extends Error {
  constructor(
    public reason: "missing_env" | "post_failed",
    public detail?: string,
  ) {
    super(`${reason}${detail ? `: ${detail}` : ""}`);
  }
}

export type LinkedInPostInput = {
  text: string;
  /** Optional URL we want LinkedIn to render as a link card. */
  shareUrl?: string;
};

export type LinkedInPostResult = {
  postId: string; // urn:li:share:...
  permalink: string;
};

const API = "https://api.linkedin.com/v2";

export async function publishLinkedInPost(input: LinkedInPostInput): Promise<LinkedInPostResult> {
  const orgUrn = process.env.LINKEDIN_ORG_URN;
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!orgUrn || !token) {
    throw new LinkedInPublisherRefusal(
      "missing_env",
      "LINKEDIN_ORG_URN / LINKEDIN_ACCESS_TOKEN not set",
    );
  }

  // LinkedIn caps shares at ~3000 chars; we trim aggressively to the
  // first 1300 (their preview cutoff anyway).
  const text = input.text.slice(0, 1300);

  const body: Record<string, unknown> = {
    author: orgUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: input.shareUrl ? "ARTICLE" : "NONE",
        ...(input.shareUrl
          ? {
              media: [
                {
                  status: "READY",
                  originalUrl: input.shareUrl,
                },
              ],
            }
          : {}),
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };

  const res = await fetch(`${API}/ugcPosts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new LinkedInPublisherRefusal("post_failed", `${res.status}: ${detail.slice(0, 400)}`);
  }

  const postId = res.headers.get("x-restli-id") ?? (await safeIdFromBody(res));
  return {
    postId,
    permalink: `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}/`,
  };
}

async function safeIdFromBody(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { id?: string };
    return data.id ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function isLinkedInConfigured(): boolean {
  return !!(process.env.LINKEDIN_ORG_URN && process.env.LINKEDIN_ACCESS_TOKEN);
}
