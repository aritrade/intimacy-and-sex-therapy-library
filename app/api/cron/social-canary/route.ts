/**
 * Social publisher canary.
 *
 * Verifies — without posting anything — that the credentials the publish
 * pipeline relies on are actually usable RIGHT NOW:
 *   - Instagram/Facebook: asks the Graph API to `debug_token` the Meta access
 *     token (validity + expiry + scopes) and confirms the token can read the
 *     configured IG business account and FB page.
 *   - YouTube: mints a fresh access token from the refresh token.
 *
 * Runs on Vercel, so it inspects the SAME env the real publishers use — the
 * truest possible pre-flight. Reachable from CI (social-canary.yml) which has
 * clean network access. Never returns any secret value.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}, same as the other crons.
 */

import { NextResponse } from "next/server";
import { getYouTubeAccessToken } from "@/lib/social/publishers/youtube-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GRAPH = "https://graph.facebook.com/v22.0";

// Scopes the IG/FB publishers need to create + publish media.
const REQUIRED_META_SCOPES = [
  "instagram_content_publish",
  "instagram_basic",
  "pages_manage_posts",
  "pages_read_engagement",
];

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}

async function handle(req: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "cron_disabled", detail: "Set CRON_SECRET to enable the social canary." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = process.env.META_GRAPH_ACCESS_TOKEN;
  const igId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const pageId = process.env.META_FACEBOOK_PAGE_ID;

  const report = {
    ts: new Date().toISOString(),
    ok: false,
    metaToken: await debugMetaToken(token),
    instagram: await checkGraphNode(token, igId, "username", "INSTAGRAM_BUSINESS_ACCOUNT_ID"),
    facebook: await checkGraphNode(token, pageId, "name", "META_FACEBOOK_PAGE_ID"),
    youtube: await checkYouTube(),
  };

  report.ok =
    report.instagram.ok && report.facebook.ok && report.youtube.ok;

  return NextResponse.json(report);
}

async function debugMetaToken(token?: string) {
  if (!token) {
    return { ok: false, detail: "META_GRAPH_ACCESS_TOKEN not set" };
  }
  try {
    const r = await fetch(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`,
    );
    const j = (await r.json()) as {
      data?: {
        is_valid?: boolean;
        expires_at?: number;
        data_access_expires_at?: number;
        scopes?: string[];
        type?: string;
        error?: { message?: string };
      };
    };
    const d = j.data;
    if (!d) return { ok: false, detail: "no debug_token data returned" };
    const scopes = d.scopes ?? [];
    const missingScopes = REQUIRED_META_SCOPES.filter((s) => !scopes.includes(s));
    return {
      ok: !!d.is_valid && missingScopes.length === 0,
      valid: !!d.is_valid,
      type: d.type,
      // expires_at === 0 means a non-expiring (system-user) token.
      expiresAt:
        d.expires_at === 0
          ? "never"
          : d.expires_at
            ? new Date(d.expires_at * 1000).toISOString()
            : "unknown",
      missingScopes,
      detail: d.error?.message,
    };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

async function checkGraphNode(
  token: string | undefined,
  id: string | undefined,
  fields: string,
  idEnvName: string,
) {
  if (!token) return { ok: false, detail: "META_GRAPH_ACCESS_TOKEN not set" };
  if (!id) return { ok: false, detail: `${idEnvName} not set` };
  try {
    const r = await fetch(
      `${GRAPH}/${encodeURIComponent(id)}?fields=${fields}&access_token=${encodeURIComponent(token)}`,
    );
    const j = (await r.json()) as Record<string, unknown> & {
      error?: { message?: string; code?: number };
    };
    if (j.error) {
      return { ok: false, detail: `${j.error.code ?? ""} ${j.error.message ?? "graph error"}`.trim() };
    }
    // Echo the resolved handle/name (not a secret) so the operator can confirm
    // it's the right account.
    return { ok: true, resolved: (j[fields.split(",")[0]] as string) ?? undefined };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

async function checkYouTube() {
  try {
    await getYouTubeAccessToken();
    return { ok: true };
  } catch (e) {
    const err = e as { reason?: string; detail?: string; message?: string };
    return {
      ok: false,
      detail: (err.detail ?? err.message ?? err.reason ?? "youtube token exchange failed").slice(0, 200),
    };
  }
}
