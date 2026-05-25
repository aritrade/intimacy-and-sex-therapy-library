/**
 * Node-runtime admin guard for /api/admin/* route handlers.
 *
 * Replaces the edge-middleware admin gate, which silently fails to decode
 * the Auth.js session cookie in our deployment (root cause still unclear —
 * the same cookie decodes fine via `auth()` here in the Node runtime). The
 * middleware is now just a cookie-presence sieve; the authoritative check
 * happens here.
 *
 * Authorization passes when EITHER:
 *   1. The session JWT carries `roles: ["admin", ...]` (canonical), OR
 *   2. The session's verified email is in BOOTSTRAP_ADMIN_EMAILS (fallback —
 *      same env var the jwt() callback already trusts, used here directly
 *      so the gate doesn't depend on role propagation to the JWT working).
 *
 * Returns the admin context on success, or a JSON error response that the
 * caller should `return` directly. Use the `instanceof NextResponse` check
 * to discriminate.
 */

import { NextResponse } from "next/server";
import { auth } from "./auth";

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

  if (!userId) {
    return NextResponse.json(
      { error: "unauthorized", detail: "Sign in at /sign-in first." },
      { status: 401 },
    );
  }

  const isAdmin = roles.includes("admin") || BOOTSTRAP_ADMIN_EMAILS.includes(email);
  if (!isAdmin) {
    return NextResponse.json(
      { error: "forbidden", detail: "Admin role required." },
      { status: 403 },
    );
  }

  return { userId, email, roles };
}
