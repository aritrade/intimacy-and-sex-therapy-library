/**
 * Full Auth.js v5 configuration. Runs in the Node runtime (used by the route
 * handler at /api/auth/[...nextauth] and by server components / route
 * handlers calling `auth()`).
 *
 * Providers come from edge-config.ts (env-gated). This file adds:
 *   - Drizzle adapter for users / accounts / verification tokens
 *   - JWT-claim enrichment with the user's roles from user_roles
 *
 * If DATABASE_URL is unset, we still construct NextAuth (so /api/auth/* exists
 * and can return a clean 503), but the adapter is dropped.
 */

import NextAuth, { type DefaultSession } from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";
import { db, getDbInstance } from "@/lib/db/client";
import {
  accounts,
  sessions,
  users,
  userRoles,
  verificationTokens,
} from "@/lib/db/schema";
import { edgeAuthConfig } from "./edge-config";
import { recordAudit } from "@/lib/observability/audit";

/**
 * Comma-separated list of emails that auto-receive the `admin` role on first
 * sign-in. Read once at module load — changing it requires a deploy, which
 * is the right tradeoff for an authorisation list. Empty list => no
 * bootstrap (production should ALWAYS set at least one bootstrap admin).
 */
const BOOTSTRAP_ADMIN_EMAILS = (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter((e) => e.length > 0);

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: string[];
    } & DefaultSession["user"];
  }
}

export const isAuthConfigured =
  !!process.env.AUTH_SECRET && (edgeAuthConfig.providers?.length ?? 0) > 0;

// `DrizzleAdapter` does `is(db, PgDatabase)` which is `instanceof`-based and
// breaks through the lazy Proxy in lib/db/client.ts — we must hand it the
// real PgDatabase instance via getDbInstance().
const adapter = process.env.DATABASE_URL
  ? DrizzleAdapter(getDbInstance(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    })
  : undefined;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...edgeAuthConfig,
  adapter,
  callbacks: {
    ...edgeAuthConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.id && process.env.DATABASE_URL) {
        token.sub = user.id;

        // Bootstrap admin: if this user's email is in the allowlist AND they
        // don't already have the admin role, stamp it. Idempotent — the
        // composite primary key (userId, role) makes the second insert a
        // no-op via ON CONFLICT.
        const email = (user.email ?? "").toLowerCase();
        if (email && BOOTSTRAP_ADMIN_EMAILS.includes(email)) {
          try {
            const existingAdmin = await db
              .select({ role: userRoles.role })
              .from(userRoles)
              .where(and(eq(userRoles.userId, user.id), eq(userRoles.role, "admin")))
              .limit(1);
            if (existingAdmin.length === 0) {
              await db
                .insert(userRoles)
                .values({ userId: user.id, role: "admin", grantedBy: user.id })
                .onConflictDoNothing();
              void recordAudit({
                actor: user.id,
                action: "role_bootstrap_admin",
                meta: { source: "BOOTSTRAP_ADMIN_EMAILS" },
              });
            }
          } catch {
            // Swallow: a transient DB failure should not lock the user out;
            // they'll retry the sign-in and get the role then.
          }
        }

        const rows = await db
          .select({ role: userRoles.role })
          .from(userRoles)
          .where(eq(userRoles.userId, user.id));
        (token as { roles?: string[] }).roles = rows.map((r) => r.role);
      }
      const t = token as { roles?: string[] };
      if (!t.roles || t.roles.length === 0) t.roles = ["user"];
      return token;
    },
  },
});
