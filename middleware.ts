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

export default auth((req) => {
  const adminRoute =
    req.nextUrl.pathname.startsWith("/admin") ||
    req.nextUrl.pathname.startsWith("/api/admin");

  if (!adminRoute) return NextResponse.next();

  const roles = req.auth?.user?.roles;
  if (Array.isArray(roles) && roles.includes("admin")) return NextResponse.next();

  const basicDenial = adminAuthCheck(req);
  if (basicDenial) return basicDenial;

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
