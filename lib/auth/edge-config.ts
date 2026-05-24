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

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: { params: { scope: "openid email profile" } },
    }),
  );
}

if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
  providers.push(
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM,
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
