/**
 * Subsystem health checks shared by GET /api/health AND the public /status
 * page. Keeping them in a single module means the JSON probe and the human
 * page can never disagree about whether a subsystem is up.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { isKmsConfigured, getKms } from "@/lib/kms";

export type Subsystem = { ok: boolean; detail?: string };
export type HealthReport = {
  ok: boolean;
  ts: string;
  subsystems: {
    db: Subsystem;
    kms: Subsystem;
    llm: Subsystem;
    embed: Subsystem;
  };
};

export async function getHealthReport(): Promise<HealthReport> {
  const out: HealthReport = {
    ok: true,
    ts: new Date().toISOString(),
    subsystems: {
      db: { ok: false },
      kms: { ok: false },
      llm: { ok: false },
      embed: { ok: false },
    },
  };

  // DB + extensions
  try {
    if (!process.env.DATABASE_URL) {
      out.subsystems.db = { ok: false, detail: "DATABASE_URL not set" };
    } else {
      const rows = (await db.execute(
        sql`select extname from pg_extension where extname in ('vector','pg_trgm')`,
      )) as unknown as Array<{ extname: string }>;
      const exts = rows.map((r) => r.extname);
      const hasVec = exts.includes("vector");
      out.subsystems.db = {
        ok: hasVec,
        detail: hasVec ? `extensions=${exts.join(",")}` : "vector extension missing",
      };
    }
  } catch (e) {
    out.subsystems.db = { ok: false, detail: (e as Error).message };
  }

  // KMS round-trip
  try {
    if (!isKmsConfigured()) {
      out.subsystems.kms = { ok: false, detail: "no KMS configured" };
    } else {
      const r = await getKms().healthcheck();
      out.subsystems.kms = r.ok
        ? { ok: true, detail: `provider=${r.provider}` }
        : { ok: false, detail: r.error };
    }
  } catch (e) {
    out.subsystems.kms = { ok: false, detail: (e as Error).message };
  }

  // We DO NOT make billable LLM calls here — only confirm that the keys
  // are present in env. The eval harness validates real correctness.
  out.subsystems.llm = process.env.ANTHROPIC_API_KEY
    ? { ok: true, detail: "anthropic key present" }
    : { ok: false, detail: "ANTHROPIC_API_KEY not set" };

  out.subsystems.embed = process.env.OPENAI_API_KEY
    ? { ok: true, detail: "openai key present" }
    : { ok: false, detail: "OPENAI_API_KEY not set" };

  out.ok = out.subsystems.db.ok && out.subsystems.kms.ok;
  return out;
}
