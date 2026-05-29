/**
 * Admin auth — Basic Auth gate around /admin/* and /api/admin/*.
 *
 * Reads `ADMIN_BASIC_USER` / `ADMIN_BASIC_PASS` from env. Comparison is
 * constant-time. This is intentionally minimal — when the project gets a real
 * auth provider (Clerk/NextAuth), swap this for role-based access.
 *
 * Returns null on success, or a `Response` to short-circuit the request when
 * auth fails / is unconfigured.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const REALM = "Intimacy & Sex Therapy Library Admin";

export function isBasicAuthEnabled(): boolean {
  // Explicit disable wins. Default: enabled iff both creds are set.
  if (process.env.ADMIN_BASIC_AUTH_ENABLED === "0") return false;
  return Boolean(process.env.ADMIN_BASIC_USER && process.env.ADMIN_BASIC_PASS);
}

/**
 * Validate a raw `Authorization` header value against the configured
 * Basic-auth admin credentials. Returns true only when Basic-auth is
 * enabled AND the header carries the exact username:password pair.
 *
 * Decoupled from `NextRequest` (takes the header string directly) so it
 * can be reused by the Node-runtime API guard, which reads headers via
 * `next/headers` rather than from a `NextRequest`. Comparison is
 * constant-time, matching `adminAuthCheck`.
 */
export function basicAuthHeaderValid(header: string | null | undefined): boolean {
  if (!isBasicAuthEnabled()) return false;
  if (!header?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length).trim());
  } catch {
    return false;
  }
  const sepIdx = decoded.indexOf(":");
  if (sepIdx < 0) return false;
  const candidateUser = decoded.slice(0, sepIdx);
  const candidatePass = decoded.slice(sepIdx + 1);
  return (
    constantTimeEq(candidateUser, process.env.ADMIN_BASIC_USER!) &&
    constantTimeEq(candidatePass, process.env.ADMIN_BASIC_PASS!)
  );
}

export function adminAuthCheck(req: NextRequest): NextResponse | null {
  if (!isBasicAuthEnabled()) {
    // Basic-auth fallback is off (or creds not configured). The session-role
    // path is the only way in. We return 401 so curl callers still get a
    // useful response, but DO NOT issue a Basic-auth challenge — that would
    // mislead operators into believing the username/password path works.
    return new NextResponse(
      "Admin requires a signed-in session with the 'admin' role. " +
        "Sign in at /sign-in with an account whose email is in BOOTSTRAP_ADMIN_EMAILS, " +
        "or set ADMIN_BASIC_USER/ADMIN_BASIC_PASS to enable Basic-auth fallback.",
      { status: 401, headers: { "Content-Type": "text/plain" } },
    );
  }
  const user = process.env.ADMIN_BASIC_USER!;
  const pass = process.env.ADMIN_BASIC_PASS!;

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Basic ")) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": `Basic realm="${REALM}"`,
        "Content-Type": "text/plain",
      },
    });
  }

  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length).trim());
  } catch {
    return new NextResponse("Invalid auth header", { status: 400 });
  }

  const sepIdx = decoded.indexOf(":");
  if (sepIdx < 0) return new NextResponse("Invalid auth header", { status: 400 });
  const candidateUser = decoded.slice(0, sepIdx);
  const candidatePass = decoded.slice(sepIdx + 1);

  if (!constantTimeEq(candidateUser, user) || !constantTimeEq(candidatePass, pass)) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": `Basic realm="${REALM}"`,
        "Content-Type": "text/plain",
      },
    });
  }

  return null;
}

/**
 * Stable-but-anonymous identifier for the admin actor on a request.
 *
 * For Basic Auth this is the username (so audit lines stay correlated
 * within a single ops account); for session-authed admins, the route
 * handler should pass `userId` instead. Returns "anonymous" as a
 * defensive fallback so audit writes never throw.
 */
export function adminActorId(req: Request): string {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice("Basic ".length).trim());
      const idx = decoded.indexOf(":");
      if (idx > 0) return `basic:${decoded.slice(0, idx)}`;
    } catch {
      /* fall through */
    }
  }
  return "anonymous";
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Even when lengths differ, do a fixed-length compare to keep timing flat.
    let mismatch = a.length ^ b.length;
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return mismatch === 0;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
