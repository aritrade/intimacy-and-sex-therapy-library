/**
 * Daily content generation, run from .github/workflows/daily-generate.yml.
 *
 * Why GitHub Actions (and not the Vercel cron):
 *   - Vercel's Hobby plan caps serverless functions at 60s. Generating 3
 *     reels + 2 long-form essays on Groq fits *most* days, but long-form
 *     essays with a budget retry occasionally brush the ceiling and get the
 *     function killed mid-run (see the 2026-05 forensics in
 *     daily-generate/route.ts history). GH Actions has no such cap.
 *   - Generation already shares its implementation with the route via
 *     lib/social/daily-generate-core.ts, so this is a pure runtime move.
 *
 * Required GH Actions secrets:
 *   - DATABASE_URL   (Neon postgres URL)
 *   - GROQ_API_KEY   (LLM provider key)
 * Optional env (set in the workflow, not secret):
 *   - LLM_PROVIDER=groq, GROQ_MODEL, DAILY_GENERATE_* overrides
 *
 *   npx tsx scripts/daily-generate.ts
 */

import "dotenv/config";
import { runDailyGenerate } from "../lib/social/daily-generate-core";
import { isLlmConfigured, providerLabel } from "../lib/ai/llm";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[daily-generate] DATABASE_URL is not set — refusing to run.");
    process.exit(2);
  }
  if (!isLlmConfigured()) {
    console.error(
      "[daily-generate] No LLM provider configured. Set GROQ_API_KEY (and " +
        "LLM_PROVIDER=groq) or another supported provider.",
    );
    process.exit(2);
  }

  console.log(`[daily-generate] provider=${providerLabel()}`);
  const result = await runDailyGenerate({ actor: "cron:gh-actions" });

  if (result.skipped) {
    console.log(
      `[daily-generate] SKIPPED reason=${result.reason} stuckCount=${result.stuckCount} threshold=${result.threshold}`,
    );
    process.exit(0);
  }

  console.log(
    `[daily-generate] DONE attempted=${result.attempted} created=${result.created} ` +
      `refused=${result.refused} failed=${result.failed}`,
  );
  if (result.errors.length > 0) {
    console.log("[daily-generate] errors:");
    for (const e of result.errors) console.log(`  - ${e.briefId}: ${e.reason}`);
  }

  // Non-zero exit when NOTHING was created so the workflow (and its
  // failure-alert step) surfaces a fully dead run, while partial success
  // (some created, some refused) stays green.
  process.exit(result.created === 0 && result.attempted > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[daily-generate] FATAL:", (e as Error).message);
  console.error((e as Error).stack);
  process.exit(1);
});
