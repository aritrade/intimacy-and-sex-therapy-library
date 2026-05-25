/**
 * Edge middleware. Gates /admin/* and /api/admin/* with two acceptable paths:
 *
 *   1. A signed-in user whose JWT carries the "admin" role.
 *   2. Basic Auth via env-configured credentials (ADMIN_BASIC_USER /
 *      ADMIN_BASIC_PASS) — ops fallback for CLI/curl access.
 *
 * Both paths are honoured to keep the door usable when our identity provider
 * is down. If both fail, returns a 401 with a Basic-Auth challenge so curl
 * users get the prompt.
 *
 * This file imports ONLY edge-safe Auth.js config (no DB drivers).
 */

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { edgeAuthConfig } from "@/lib/auth/edge-config";
import { adminAuthCheck } from "@/lib/admin/auth";

const { auth } = NextAuth(edgeAuthConfig);

/**
 * Bootstrap-admin allowlist parsed at edge-bundle build time. Anyone in this
 * list who is signed in with a verified email is treated as an admin even if
 * the user_roles row hasn't propagated to their JWT cookie yet.
 *
 * Why: the canonical path is JWT.roles includes "admin", populated by the
 * Node-runtime jwt() callback at sign-in. In practice that propagation has
 * been flaky for bootstrap users (cookie re-signing race / edge cookie
 * scope), and the failure mode locks the only operator out of /admin. The
 * email-allowlist gate is functionally identical to the role check (same
 * BOOTSTRAP_ADMIN_EMAILS env var that the jwt() callback already trusts) but
 * doesn't require any DB round-trip OR successful role propagation — Auth.js
 * always stamps the verified email onto the JWT.
 */
const BOOTSTRAP_ADMIN_EMAILS = (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter((e) => e.length > 0);

export default auth((req) => {
  const adminRoute =
    req.nextUrl.pathname.startsWith("/admin") ||
    req.nextUrl.pathname.startsWith("/api/admin");

  if (!adminRoute) return NextResponse.next();

  const roles = req.auth?.user?.roles;
  if (Array.isArray(roles) && roles.includes("admin")) return NextResponse.next();

  const email = (req.auth?.user?.email ?? "").toLowerCase();
  if (email && BOOTSTRAP_ADMIN_EMAILS.includes(email)) return NextResponse.next();

  const basicDenial = adminAuthCheck(req);
  if (basicDenial) return basicDenial;

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
