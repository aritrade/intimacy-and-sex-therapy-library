/**
 * Auth menu rendered in the NavBar.
 *
 * Server component so we can read the session and the env-derived auth flag
 * without shipping anything to the client. When auth isn't configured we
 * render nothing — the rest of the site works anonymously.
 */

import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { isAuthAvailable } from "@/lib/auth/edge-config";

export async function AuthMenu() {
  // Touch the request headers so Next treats this server component as
  // dynamic. Without it, the AuthMenu lives in the root layout and gets
  // baked into the static prerender of every page, freezing the auth state
  // captured at build time (usually "no providers configured").
  await headers();
  if (!isAuthAvailable) return null;
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <Link
        href="/sign-in"
        className="hidden sm:inline-flex items-center rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-ink-700 hover:bg-elevated transition-colors"
      >
        Sign in
      </Link>
    );
  }
  const initial = (session.user.name ?? session.user.email ?? "?")[0]?.toUpperCase() ?? "?";
  return (
    <Link
      href="/account"
      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2 py-1 text-xs text-ink-700 hover:bg-elevated transition-colors"
      aria-label="Your account"
    >
      <span
        aria-hidden
        className="grid h-6 w-6 place-items-center rounded-full bg-gradient-text text-[11px] font-semibold text-white"
      >
        {initial}
      </span>
      <span className="hidden sm:inline">Account</span>
    </Link>
  );
}
