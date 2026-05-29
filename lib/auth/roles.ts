/**
 * Role helpers for route handlers and server components.
 *
 * Two flavours:
 *   - requireRole(role): used in server components / route handlers; reads the
 *     session via `auth()` and returns `{ ok, session, response }`. Callers
 *     short-circuit with `response` if not authorised.
 *   - hasRole(session, role): pure function for in-component checks.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "./auth";
import { hasRole, type Role } from "./role-types";
import { basicAuthHeaderValid } from "@/lib/admin/auth";

export { hasRole, type Role };

export async function requireRole(required: Role): Promise<
  | { ok: true; userId: string; roles: string[] }
  | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (session?.user?.id) {
    if (!hasRole(session.user.roles, required)) {
      return {
        ok: false,
        response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
      };
    }
    return { ok: true, userId: session.user.id, roles: session.user.roles };
  }

  // No session — honour the Basic-auth fallback, consistent with
  // requireApiAdmin, the page guard, and the edge middleware. Basic-auth is
  // the admin superuser, so it satisfies any required role. Without this a
  // Basic-auth-only operator was locked out of every requireRole-gated API
  // (roles, sync/run, bulk approve/reject, invites, evergreen) in production.
  if (basicAuthHeaderValid(headers().get("authorization"))) {
    return { ok: true, userId: "basic-admin", roles: ["admin"] };
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
  };
}

export async function requireAuth(): Promise<
  | { ok: true; userId: string; roles: string[] }
  | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }
  return {
    ok: true,
    userId: session.user.id,
    roles: session.user.roles ?? [],
  };
}
