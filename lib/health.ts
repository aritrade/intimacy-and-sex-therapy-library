/**
 * Subsystem health checks shared by GET /api/health AND the public /status
 * page. Keeping them in a single module means the JSON probe and the human
 * page can never disagree about whether a subsystem is up.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { isKmsConfigured, getKms } from "@/lib/kms";
import { isLlmConfigured, providerLabel } from "@/lib/ai/llm";
import { embeddingsEnabled } from "@/lib/ai/embeddings";

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

  // We DO NOT make billable LLM calls here — only confirm a provider is
  // configured. Provider-agnostic: honours LLM_PROVIDER and any of the
  // supported keys (Groq / Anthropic / Ollama), not just Anthropic.
  out.subsystems.llm = isLlmConfigured()
    ? { ok: true, detail: providerLabel() }
    : { ok: false, detail: "no LLM provider configured (set LLM_PROVIDER + key)" };

  // Embeddings run on Gemini (gemini-embedding-001) in the free-tier deploy.
  out.subsystems.embed = embeddingsEnabled()
    ? { ok: true, detail: "gemini-embedding-001" }
    : { ok: false, detail: "GEMINI_API_KEY not set (RAG falls back to keyword search)" };

  out.ok = out.subsystems.db.ok && out.subsystems.kms.ok;
  return out;
}
