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
        session.user.roles = (token.roles as string[]) ?? ["user"];
      }
      return session;
    },
  },
};

export const isAuthAvailable = providers.length > 0;
