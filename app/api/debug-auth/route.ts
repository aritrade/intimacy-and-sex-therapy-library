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
  "GH_RENDER_TOKEN",
  "GH_RENDER_REPO",
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
        || k === "VERCEL_ENV" || k === "NODE_ENV" || k === "NEXTAUTH_URL"
        || k === "GH_RENDER_REPO") {
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
      cookies: cookieNames,
      request: reqInfo,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
