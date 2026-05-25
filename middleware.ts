/**
 * Edge middleware — coarse gate only.
 *
 * Historical context: this middleware used to wrap requests with Auth.js's
 * `auth()` helper and inspect `req.auth.user.roles` / `.email` to make the
 * admin decision. In our production deployment that wrapper consistently
 * returns null `req.auth` even when the same cookie decodes correctly via
 * Node-runtime `auth()` on /account. Net effect: signed-in admins were
 * locked out of /admin with no recovery path. Root cause unisolated.
 *
 * To stop wasting cycles on it, we moved the authoritative check to:
 *   - Page level:  lib/auth/admin-page-guard.tsx → requireAdminPage()
 *   - API level:   lib/auth/api-admin-guard.ts   → requireApiAdmin()
 *
 * Both run in the Node runtime where `auth()` works, and both honour the
 * BOOTSTRAP_ADMIN_EMAILS fallback alongside the canonical role check.
 *
 * This middleware now only:
 *   1. Lets requests with ANY Auth.js session cookie pass through to those
 *      Node-runtime guards.
 *   2. Returns the Basic Auth fallback challenge for cookie-less requests
 *      (when ADMIN_BASIC_USER / ADMIN_BASIC_PASS are configured).
 *   3. Returns a plain-text 401 for cookie-less requests when Basic Auth
 *      isn't enabled either.
 *
 * Security note: relaxing this middleware does NOT widen the attack surface
 * because the page and API guards reject unauthorised sessions in the same
 * way. The middleware is now an early-bail UX optimisation, not the gate.
 */

import { NextResponse, type NextRequest } from "next/server";
import { adminAuthCheck } from "@/lib/admin/auth";

// Auth.js v5 default cookie names — keep in sync if `cookies` is ever
// configured explicitly in lib/auth/edge-config.ts.
const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
];

export default function middleware(req: NextRequest) {
  const adminRoute =
    req.nextUrl.pathname.startsWith("/admin") ||
    req.nextUrl.pathname.startsWith("/api/admin");

  if (!adminRoute) return NextResponse.next();

  const hasSession = SESSION_COOKIE_NAMES.some((name) => req.cookies.has(name));
  if (hasSession) return NextResponse.next();

  const basicDenial = adminAuthCheck(req);
  if (basicDenial) return basicDenial;

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
