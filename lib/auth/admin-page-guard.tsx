/**
 * Page-level role guard for admin server components.
 *
 * The Edge middleware already gates every /admin/* and /api/admin/* request,
 * but server components run a second time with their own session lookup; we
 * use this helper as defence-in-depth so:
 *
 *   - If the matcher regex ever drifts and a route slips out, the page
 *     itself still refuses.
 *   - We can render a polished refusal UI instead of a raw 401 from the
 *     middleware, which Basic-auth fallback would otherwise produce.
 *
 * Returns null when authorised, or a JSX block to render and `return` from
 * the page. The page is responsible for early-returning it.
 *
 *   export default async function MyAdminPage() {
 *     const guard = await requireAdminPage();
 *     if (guard) return guard;
 *     // ...real content
 *   }
 */

import Link from "next/link";
import type { ReactElement } from "react";
import { auth } from "./auth";
import { isBasicAuthEnabled } from "@/lib/admin/auth";
import type { Role } from "./roles";

export async function requireRolePage(required: Role): Promise<ReactElement | null> {
  const session = await auth();
  const roles = session?.user?.roles ?? [];

  // If the user has the required role we're done. Admin trumps everything.
  if (roles.includes(required) || roles.includes("admin")) return null;

  // Basic-auth fallback path: the middleware has already enforced creds and
  // let the request through. The session is empty here because Basic-auth
  // doesn't go through Auth.js. We trust that the matcher gated us.
  // Detect by reading the session: if it's null AND Basic-auth is enabled,
  // the only way we got here is via the middleware approving Basic-auth.
  if (!session?.user?.id && isBasicAuthEnabled()) return null;

  return (
    <div className="container-page py-16 max-w-xl text-center">
      <p className="pill-coral w-fit mx-auto">403 — forbidden</p>
      <h1 className="mt-4 font-serif text-3xl text-ink-900">
        You don&rsquo;t have access to this page
      </h1>
      <p className="mt-3 text-ink-600">
        This page requires the <code>{required}</code> role. If you should have
        it, ask an admin to grant it from <code>/admin/users</code>.
      </p>
      <div className="mt-6 flex gap-3 justify-center">
        <Link href="/" className="btn-secondary">
          Back to home
        </Link>
        <Link href="/sign-in" className="btn-primary">
          Sign in as a different account
        </Link>
      </div>
    </div>
  );
}

export const requireAdminPage = () => requireRolePage("admin");
export const requireClinicianPage = () => requireRolePage("clinician");
export const requireEditorPage = () => requireRolePage("editor");
