/**
 * Preflight: verify the deploy environment before flipping DNS.
 *
 * Usage:
 *   tsx scripts/preflight.ts          # check current process env
 *   tsx scripts/preflight.ts --strict # treat warnings as failures
 *
 * Exits non-zero if any required check fails. Designed to be wired into a
 * Vercel "deployment protection" job or a manual pre-launch ritual — never
 * blindly into the build, because some checks (DB query, KMS round-trip)
 * cost time and money.
 */

import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import { isKmsConfigured, getKms } from "../lib/kms";

type Check = {
  name: string;
  required: boolean;
  run: () => Promise<{ ok: boolean; detail?: string }>;
};

const STRICT = process.argv.includes("--strict");

const checks: Check[] = [
  {
    name: "DATABASE_URL is set",
    required: true,
    async run() {
      return process.env.DATABASE_URL
        ? { ok: true }
        : { ok: false, detail: "set DATABASE_URL to a Neon/pgvector connection string" };
    },
  },
  {
    name: "Postgres reachable + extensions installed",
    required: true,
    async run() {
      if (!process.env.DATABASE_URL) return { ok: false, detail: "skipped: no DATABASE_URL" };
      try {
        const rows = (await db.execute(
          sql`select extname from pg_extension where extname in ('vector','pg_trgm')`,
        )) as unknown as Array<{ extname: string }>;
        const exts = rows.map((r) => r.extname);
        if (!exts.includes("vector")) {
          return { ok: false, detail: "vector extension missing — run CREATE EXTENSION vector;" };
        }
        if (!exts.includes("pg_trgm")) {
          return { ok: false, detail: "pg_trgm missing — run CREATE EXTENSION pg_trgm;" };
        }
        return { ok: true, detail: `extensions=${exts.join(",")}` };
      } catch (e) {
        return { ok: false, detail: (e as Error).message };
      }
    },
  },
  {
    name: "Migrations applied (resources table exists)",
    required: true,
    async run() {
      if (!process.env.DATABASE_URL) return { ok: false, detail: "skipped: no DATABASE_URL" };
      try {
        const rows = (await db.execute(
          sql`select count(*)::int as n from information_schema.tables where table_name = 'resources'`,
        )) as unknown as Array<{ n: number }>;
        return rows[0]?.n
          ? { ok: true }
          : { ok: false, detail: "run npm run db:migrate" };
      } catch (e) {
        return { ok: false, detail: (e as Error).message };
      }
    },
  },
  {
    name: "Allowlist seeded (sources rows present)",
    required: true,
    async run() {
      if (!process.env.DATABASE_URL) return { ok: false, detail: "skipped: no DATABASE_URL" };
      try {
        const rows = (await db.execute(
          sql`select count(*)::int as n from sources`,
        )) as unknown as Array<{ n: number }>;
        const n = rows[0]?.n ?? 0;
        return n >= 10
          ? { ok: true, detail: `${n} sources` }
          : { ok: false, detail: `only ${n} sources — run npm run db:seed` };
      } catch (e) {
        return { ok: false, detail: (e as Error).message };
      }
    },
  },
  {
    name: "ANTHROPIC_API_KEY present",
    required: true,
    async run() {
      return process.env.ANTHROPIC_API_KEY
        ? { ok: true }
        : { ok: false, detail: "AI surface is disabled without this key" };
    },
  },
  {
    name: "OPENAI_API_KEY present",
    required: true,
    async run() {
      return process.env.OPENAI_API_KEY
        ? { ok: true }
        : { ok: false, detail: "embeddings + Whisper STT are disabled" };
    },
  },
  {
    name: "KMS configured + round-trip works",
    required: true,
    async run() {
      if (!isKmsConfigured()) {
        return { ok: false, detail: "KMS_PROVIDER + key vars not set" };
      }
      const r = await getKms().healthcheck();
      return r.ok
        ? { ok: true, detail: `provider=${r.provider}` }
        : { ok: false, detail: r.error };
    },
  },
  {
    name: "AUTH_SECRET set (if any auth provider configured)",
    required: false,
    async run() {
      const hasProvider =
        !!process.env.AUTH_GOOGLE_ID || !!process.env.AUTH_RESEND_KEY;
      if (!hasProvider) return { ok: true, detail: "no auth providers; skipped" };
      return process.env.AUTH_SECRET
        ? { ok: true }
        : { ok: false, detail: "providers configured but AUTH_SECRET is missing" };
    },
  },
  {
    name: "Admin Basic-auth fallback set",
    required: false,
    async run() {
      return process.env.ADMIN_BASIC_USER && process.env.ADMIN_BASIC_PASS
        ? { ok: true }
        : { ok: false, detail: "/admin will only accept admin-role sessions" };
    },
  },
  {
    name: "NEXT_PUBLIC_SITE_URL is HTTPS",
    required: false,
    async run() {
      const u = process.env.NEXT_PUBLIC_SITE_URL ?? "";
      if (!u) return { ok: false, detail: "unset; sitemap/robots will use localhost" };
      if (!u.startsWith("https://"))
        return { ok: false, detail: "must be https in production" };
      return { ok: true, detail: u };
    },
  },
  {
    name: "Plausible / Umami host configured (optional)",
    required: false,
    async run() {
      const has =
        !!process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ||
        !!process.env.NEXT_PUBLIC_UMAMI_HOST;
      return has
        ? { ok: true }
        : { ok: false, detail: "no analytics — that is fine, just confirming intent" };
    },
  },
];

async function main() {
  console.log(`Preflight checks${STRICT ? " (strict mode)" : ""}\n`);

  let failed = 0;
  let warned = 0;

  for (const c of checks) {
    let r: { ok: boolean; detail?: string };
    try {
      r = await c.run();
    } catch (e) {
      r = { ok: false, detail: (e as Error).message };
    }
    const tag = r.ok ? "PASS" : c.required ? "FAIL" : "WARN";
    const line = `[${tag}] ${c.name}${r.detail ? ` — ${r.detail}` : ""}`;
    console.log(line);
    if (!r.ok) {
      if (c.required) failed++;
      else warned++;
    }
  }

  console.log("");
  console.log(`Summary: ${failed} required failure(s), ${warned} optional warning(s).`);

  const exitNonZero = failed > 0 || (STRICT && warned > 0);
  if (exitNonZero) {
    console.error("Preflight FAILED. Do not promote this build.");
    process.exit(1);
  }
  console.log("Preflight passed. Safe to soft-launch (after the human checklist in DEPLOY.md).");
  process.exit(0);
}

main().catch((e) => {
  console.error("preflight crashed:", e);
  process.exit(2);
});
