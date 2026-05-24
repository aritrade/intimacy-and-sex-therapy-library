/**
 * Resolve the admin actor for audit logging.
 *
 * Order of preference:
 *   1. A signed-in session — returns `userId:<uuid>`. Most informative for
 *      the audit log because role changes and approvals can be tied back to
 *      a real human.
 *   2. Basic-auth username (when the fallback path is enabled) — returns
 *      `basic:<username>`.
 *   3. `anonymous` — should be impossible behind the admin gate, but kept
 *      as a defensive fallback so audit writes never throw.
 *
 * NEVER throw: this runs inside route handlers that have already done their
 * real work; a logging failure must not unwind a successful state change.
 */

import { auth } from "@/lib/auth/auth";

export async function getActor(req: Request): Promise<string> {
  try {
    const s = await auth();
    if (s?.user?.id) return `userId:${s.user.id}`;
  } catch {
    /* fall through to basic-auth */
  }
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

/**
 * Resolve role(s) for the current request. Returns whatever `requireRole`
 * sees minus the response — useful when a route handler wants to fork on
 * role inside a single endpoint.
 */
export async function getActorRoles(): Promise<string[]> {
  try {
    const s = await auth();
    return s?.user?.roles ?? [];
  } catch {
    return [];
  }
}
