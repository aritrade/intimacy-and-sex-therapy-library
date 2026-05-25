/**
 * Google OAuth 2 — installed-app refresh-token flow for the YouTube
 * Data API.
 *
 * Why this exists: the YouTube publisher needs a *fresh* access token
 * for every upload (Google rotates them every ~1 hour). Operators
 * provision a long-lived refresh token once via `oauth2l` or the OAuth
 * Playground, then we exchange it for an access token on demand.
 *
 *   POST https://oauth2.googleapis.com/token
 *     grant_type=refresh_token
 *     client_id=...
 *     client_secret=...
 *     refresh_token=...
 *
 * We cache the access token in memory until ~5 minutes before its
 * stated expiry to avoid hammering the token endpoint when multiple
 * uploads happen in a single cron run.
 */

type CachedToken = {
  accessToken: string;
  expiresAt: number; // epoch ms
};

let cache: CachedToken | null = null;

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SAFETY_MARGIN_MS = 5 * 60 * 1000;

export class YouTubeOAuthRefusal extends Error {
  constructor(
    public reason: "missing_env" | "exchange_failed",
    public detail?: string,
  ) {
    super(`${reason}${detail ? `: ${detail}` : ""}`);
  }
}

export async function getYouTubeAccessToken(): Promise<string> {
  const now = Date.now();
  if (cache && cache.expiresAt - SAFETY_MARGIN_MS > now) {
    return cache.accessToken;
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new YouTubeOAuthRefusal(
      "missing_env",
      "YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN not set",
    );
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    cache = null;
    const detail = await res.text().catch(() => "");
    throw new YouTubeOAuthRefusal("exchange_failed", `${res.status}: ${detail.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!data.access_token) {
    throw new YouTubeOAuthRefusal(
      "exchange_failed",
      data.error_description ?? data.error ?? "no access_token in response",
    );
  }

  const ttlMs = (data.expires_in ?? 3600) * 1000;
  cache = {
    accessToken: data.access_token,
    expiresAt: now + ttlMs,
  };
  return data.access_token;
}

/** Test-only: clear the in-memory cache. */
export function _resetYouTubeAccessTokenCache() {
  cache = null;
}
