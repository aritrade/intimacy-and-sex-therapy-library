/**
 * Twitter / X v2 publisher.
 *
 * Posts a single tweet (≤280 chars) with an optional shared URL. We
 * skip media-upload for the same reason as LinkedIn — the v2 media
 * upload endpoint is GA only on the paid Basic tier, while the free
 * tier allows ~50 text posts/day which more than covers our cadence.
 *
 * Auth: OAuth 1.0a user-context (the only path that lets us post
 * without paying). The client takes 4 secrets:
 *
 *   TWITTER_API_KEY
 *   TWITTER_API_SECRET
 *   TWITTER_ACCESS_TOKEN
 *   TWITTER_ACCESS_SECRET
 *
 * The OAuth signing is done inline so we don't pull a heavy npm dep
 * just for one endpoint.
 */

import { createHmac, randomBytes } from "node:crypto";

export class TwitterPublisherRefusal extends Error {
  constructor(
    public reason: "missing_env" | "post_failed",
    public detail?: string,
  ) {
    super(`${reason}${detail ? `: ${detail}` : ""}`);
  }
}

export type TweetInput = {
  text: string;
  /** Optional canonical URL — appended at the end if it fits. */
  shareUrl?: string;
};

export type TweetResult = {
  postId: string;
  permalink: string;
};

const ENDPOINT = "https://api.twitter.com/2/tweets";

export async function publishTweet(input: TweetInput): Promise<TweetResult> {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    throw new TwitterPublisherRefusal(
      "missing_env",
      "TWITTER_API_KEY / TWITTER_API_SECRET / TWITTER_ACCESS_TOKEN / TWITTER_ACCESS_SECRET not set",
    );
  }

  // Pack text + share URL into ≤280. We keep 24 chars of headroom for
  // the URL since X auto-shortens via t.co.
  let text = input.text.trim();
  if (input.shareUrl) {
    const URL_BUDGET = 24;
    const max = 280 - URL_BUDGET - 1;
    if (text.length > max) text = text.slice(0, max - 1) + "…";
    text = `${text} ${input.shareUrl}`;
  } else if (text.length > 280) {
    text = text.slice(0, 279) + "…";
  }

  const oauth = signOAuth(
    "POST",
    ENDPOINT,
    {},
    {
      apiKey,
      apiSecret,
      accessToken,
      accessSecret,
    },
  );

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: oauth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new TwitterPublisherRefusal("post_failed", `${res.status}: ${detail.slice(0, 400)}`);
  }

  const data = (await res.json()) as { data?: { id?: string } };
  const id = data.data?.id ?? "unknown";
  return {
    postId: id,
    permalink: `https://twitter.com/i/web/status/${id}`,
  };
}

export function isTwitterConfigured(): boolean {
  return !!(
    process.env.TWITTER_API_KEY &&
    process.env.TWITTER_API_SECRET &&
    process.env.TWITTER_ACCESS_TOKEN &&
    process.env.TWITTER_ACCESS_SECRET
  );
}

// ---------------------------------------------------------------------------
// OAuth 1.0a signing
// ---------------------------------------------------------------------------

function signOAuth(
  method: string,
  url: string,
  query: Record<string, string>,
  cfg: {
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessSecret: string;
  },
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: cfg.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: cfg.accessToken,
    oauth_version: "1.0",
  };

  const all: Record<string, string> = { ...oauthParams, ...query };
  const paramString = Object.keys(all)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(all[k])}`)
    .join("&");
  const baseString = [
    method.toUpperCase(),
    rfc3986(url),
    rfc3986(paramString),
  ].join("&");
  const signingKey = `${rfc3986(cfg.apiSecret)}&${rfc3986(cfg.accessSecret)}`;
  const signature = createHmac("sha1", signingKey).update(baseString).digest("base64");

  const header =
    "OAuth " +
    Object.entries({ ...oauthParams, oauth_signature: signature })
      .map(([k, v]) => `${rfc3986(k)}="${rfc3986(v)}"`)
      .join(", ");

  return header;
}

function rfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}
