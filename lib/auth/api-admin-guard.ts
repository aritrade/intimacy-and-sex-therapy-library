/**
 * Node-runtime admin guard for /api/admin/* route handlers.
 *
 * Replaces the edge-middleware admin gate, which silently fails to decode
 * the Auth.js session cookie in our deployment (root cause still unclear —
 * the same cookie decodes fine via `auth()` here in the Node runtime). The
 * middleware is now just a cookie-presence sieve; the authoritative check
 * happens here.
 *
 * Authorization passes when ANY of:
 *   1. The session JWT carries `roles: ["admin", ...]` (canonical), OR
 *   2. The session's verified email is in BOOTSTRAP_ADMIN_EMAILS (fallback —
 *      same env var the jwt() callback already trusts, used here directly
 *      so the gate doesn't depend on role propagation to the JWT working), OR
 *   3. The request carries valid Basic-auth admin credentials and Basic-auth
 *      is enabled. This mirrors the edge middleware (`adminAuthCheck`) and the
 *      page guard (`requireRolePage`), both of which already honour the
 *      Basic-auth fallback. Without this branch a Basic-auth-only operator
 *      could view admin PAGES but got 401 on every /api/admin/* action — the
 *      session-only check here was the asymmetry. We re-validate the creds in
 *      the Node runtime (rather than trusting the middleware matcher) so the
 *      guard is correct even if the matcher ever drifts.
 *
 * Returns the admin context on success, or a JSON error response that the
 * caller should `return` directly. Use the `instanceof NextResponse` check
 * to discriminate.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "./auth";
import { basicAuthHeaderValid } from "@/lib/admin/auth";

const BOOTSTRAP_ADMIN_EMAILS = (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter((e) => e.length > 0);

export type ApiAdminContext = {
  userId: string;
  email: string;
  roles: string[];
};

export async function requireApiAdmin(): Promise<NextResponse | ApiAdminContext> {
  const session = await auth();
  const userId = session?.user?.id;
  const email = (session?.user?.email ?? "").toLowerCase();
  const roles = session?.user?.roles ?? [];

  if (userId) {
    const isAdmin = roles.includes("admin") || BOOTSTRAP_ADMIN_EMAILS.includes(email);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "forbidden", detail: "Admin role required." },
        { status: 403 },
      );
    }
    return { userId, email, roles };
  }

  // No session — honour the Basic-auth fallback, consistent with the edge
  // middleware and the page guard. `basicAuthHeaderValid` returns false unless
  // Basic-auth is enabled and the credentials match exactly (constant-time).
  if (basicAuthHeaderValid(headers().get("authorization"))) {
    return { userId: "basic-admin", email: "", roles: ["admin"] };
  }

  return NextResponse.json(
    { error: "unauthorized", detail: "Sign in at /sign-in first." },
    { status: 401 },
  );
}
