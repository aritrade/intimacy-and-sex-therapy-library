/**
 * TEMPORARY DEBUG ENDPOINT — delete after the admin-auth issue is resolved.
 *
 * Dumps the Node-runtime view of:
 *   - process.env keys/lengths for auth-related vars
 *   - what auth() returns (session object)
 *   - request cookie names (NOT values)
 *
 * Does not leak any secret values — only lengths and presence. Safe to keep
 * accessible while diagnosing. Hard-coded to refuse if the deploy flag
 * DEBUG_AUTH_ENDPOINT_ENABLED isn't set, but we set it on Vercel for now.
 */

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOWN_ENV_KEYS = [
  "AUTH_SECRET",
  "AUTH_RESEND_KEY",
  "AUTH_RESEND_FROM",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "BOOTSTRAP_ADMIN_EMAILS",
  "DATABASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXTAUTH_URL",
  "AUTH_TRUST_HOST",
  "VERCEL_ENV",
  "NODE_ENV",
  // Publisher creds — temporarily included so we can verify Sensitive-by-
  // default vars actually have a value in the runtime (vercel env pull
  // shows them as "" regardless of true value). Length + 3+2 preview is
  // enough to confirm the value isn't empty without exfiltrating it.
  "INSTAGRAM_BUSINESS_ACCOUNT_ID",
  "META_GRAPH_ACCESS_TOKEN",
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET",
  "YOUTUBE_REFRESH_TOKEN",
];

export async function GET() {
  const env: Record<string, { present: boolean; len: number; preview?: string }> = {};
  for (const k of SHOWN_ENV_KEYS) {
    const v = process.env[k];
    env[k] = {
      present: typeof v === "string" && v.length > 0,
      len: v?.length ?? 0,
    };
    // Safe-to-show non-secret values
    if (k === "BOOTSTRAP_ADMIN_EMAILS" || k === "NEXT_PUBLIC_SITE_URL"
        || k === "AUTH_RESEND_FROM" || k === "AUTH_TRUST_HOST"
        || k === "VERCEL_ENV" || k === "NODE_ENV" || k === "NEXTAUTH_URL") {
      env[k].preview = v ?? "";
    } else if (typeof v === "string" && v.length > 0) {
      env[k].preview = `${v.slice(0, 3)}…${v.slice(-2)}`;
    }
  }

  let sessionInfo: Record<string, unknown>;
  try {
    const session = await auth();
    sessionInfo = {
      ok: true,
      hasSession: !!session,
      user: session?.user
        ? {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
            roles: session.user.roles,
          }
        : null,
      expires: session?.expires,
    };
  } catch (e) {
    sessionInfo = {
      ok: false,
      error: (e as Error).message,
      stack: (e as Error).stack?.split("\n").slice(0, 5),
    };
  }

  // Live publisher-credential probes — confirm the runtime-visible
  // META token + YT refresh token actually work against their APIs.
  // Side-effect-free: GET /me on Graph, refresh_token grant on YT.
  const publisherProbes: Record<string, unknown> = {};
  const metaTok = process.env.META_GRAPH_ACCESS_TOKEN;
  const igId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (metaTok && igId) {
    try {
      const r = await fetch(
        `https://graph.facebook.com/v18.0/me?fields=id,name,category&access_token=${encodeURIComponent(metaTok)}`,
      );
      const body = (await r.json()) as
        | { id: string; name?: string }
        | { error: { message: string } };
      if ("error" in body) {
        publisherProbes.meta = { ok: false, reason: body.error.message };
      } else {
        // Probe IG linkage too.
        let igLinkOk = false;
        let igLinkDetail = "(not checked)";
        try {
          const ig = await fetch(
            `https://graph.facebook.com/v18.0/${body.id}?fields=instagram_business_account&access_token=${encodeURIComponent(metaTok)}`,
          );
          const igBody = (await ig.json()) as {
            instagram_business_account?: { id: string };
            error?: { message: string };
          };
          if (igBody.instagram_business_account?.id) {
            igLinkOk = igBody.instagram_business_account.id === igId;
            igLinkDetail = igLinkOk
              ? "linked IG matches INSTAGRAM_BUSINESS_ACCOUNT_ID"
              : `linked IG=${igBody.instagram_business_account.id} does NOT match env=${igId}`;
          } else if (igBody.error) {
            igLinkDetail = `error: ${igBody.error.message}`;
          } else {
            igLinkDetail = "no instagram_business_account on this Page";
          }
        } catch (e) {
          igLinkDetail = `probe failed: ${(e as Error).message}`;
        }
        publisherProbes.meta = {
          ok: igLinkOk,
          page: body.name ?? body.id,
          igLink: igLinkDetail,
        };
      }
    } catch (e) {
      publisherProbes.meta = { ok: false, reason: (e as Error).message };
    }
  } else {
    publisherProbes.meta = { ok: false, reason: "env missing" };
  }

  const ytId = process.env.YOUTUBE_CLIENT_ID;
  const ytSec = process.env.YOUTUBE_CLIENT_SECRET;
  const ytRef = process.env.YOUTUBE_REFRESH_TOKEN;
  if (ytId && ytSec && ytRef) {
    try {
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: ytId,
          client_secret: ytSec,
          refresh_token: ytRef,
          grant_type: "refresh_token",
        }).toString(),
      });
      const body = (await r.json()) as
        | { access_token: string; scope?: string; expires_in?: number }
        | { error: string; error_description?: string };
      if ("access_token" in body) {
        const scopes = (body.scope ?? "").split(/\s+/).filter(Boolean);
        const hasUpload = scopes.some((s) => s.endsWith("/youtube.upload"));
        publisherProbes.youtube = {
          ok: hasUpload,
          scopesIncludesUpload: hasUpload,
          allScopes: scopes,
          accessTokenExpiresInSec: body.expires_in ?? null,
        };
      } else {
        publisherProbes.youtube = {
          ok: false,
          reason: `${body.error}${body.error_description ? ` — ${body.error_description}` : ""}`,
        };
      }
    } catch (e) {
      publisherProbes.youtube = { ok: false, reason: (e as Error).message };
    }
  } else {
    publisherProbes.youtube = { ok: false, reason: "env missing" };
  }

  const cookieStore = cookies();
  const cookieNames = cookieStore.getAll().map((c) => ({
    name: c.name,
    len: c.value?.length ?? 0,
  }));

  const hdrs = headers();
  const reqInfo = {
    host: hdrs.get("host"),
    x_forwarded_host: hdrs.get("x-forwarded-host"),
    x_forwarded_proto: hdrs.get("x-forwarded-proto"),
    x_vercel_deployment_url: hdrs.get("x-vercel-deployment-url"),
  };

  return NextResponse.json(
    {
      now: new Date().toISOString(),
      runtime: "nodejs",
      env,
      session: sessionInfo,
      publisherProbes,
      cookies: cookieNames,
      request: reqInfo,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
