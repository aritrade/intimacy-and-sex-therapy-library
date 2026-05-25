/**
 * Edge-safe Auth.js config — providers list only, NO DB adapter, NO Node
 * imports. Used by middleware.ts (which runs in the Edge runtime).
 *
 * The same providers are spread into the full config in lib/auth/auth.ts
 * along with the Drizzle adapter and DB-touching callbacks.
 */

import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

const providers: NextAuthConfig["providers"] = [];

// Auth.js v5 standard env-var naming: AUTH_<PROVIDER>_ID / AUTH_<PROVIDER>_SECRET
// for OAuth providers, AUTH_<PROVIDER>_KEY for email providers. Documented in
// .env.example. Do NOT rename to GOOGLE_CLIENT_ID / RESEND_API_KEY — those are
// the third-party SDK conventions and were the source of a real outage where
// providers silently went missing on Vercel because the env names didn't match.
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: { params: { scope: "openid email profile" } },
    }),
  );
}

if (process.env.AUTH_RESEND_KEY && process.env.AUTH_RESEND_FROM) {
  providers.push(
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_RESEND_FROM,
    }),
  );
}

/**
 * Bootstrap-admin allowlist parsed at module load. This is the SAME env var
 * the jwt() callback in auth.ts uses to seed the `admin` user_roles row on
 * first sign-in. We also consult it here so the session.user.roles array
 * always reflects admin status for these emails, even if the role row never
 * propagated to the JWT token (real bug we've been hitting — DB has the row
 * but the SELECT-after-INSERT path stamped an empty roles array onto the
 * cookie). One place to fix the symptom for every downstream consumer.
 */
const BOOTSTRAP_ADMIN_EMAILS = (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter((e) => e.length > 0);

export const edgeAuthConfig: NextAuthConfig = {
  providers,
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/sign-in" },
  callbacks: {
    // Pure JWT inspection — no DB calls allowed in the edge runtime. The
    // full config in lib/auth/auth.ts mirrors this and ALSO writes role
    // claims at sign-in time.
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub as string) ?? "";
        let roles = (token.roles as string[]) ?? ["user"];

        const email = (session.user.email ?? "").toLowerCase();
        if (
          email &&
          BOOTSTRAP_ADMIN_EMAILS.includes(email) &&
          !roles.includes("admin")
        ) {
          roles = [...roles, "admin"];
        }

        session.user.roles = roles;
      }
      return session;
    },
  },
};

export const isAuthAvailable = providers.length > 0;
