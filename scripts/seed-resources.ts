/**
 * Seed the catalog with the curated resource set.
 *
 *   npm run db:seed-resources
 *
 * Pumps the static list in `lib/seed/curated-resources.ts` through the
 * standard ingestion pipeline. The pipeline auto-tags (heuristic; uses Claude
 * if ANTHROPIC_API_KEY is set), chunks + embeds full-text licensed entries
 * (uses OpenAI if OPENAI_API_KEY is set, otherwise stores chunks unembedded),
 * and inserts every resource as `is_published=false` so a curator must
 * approve via the admin UI before anything is shown publicly.
 *
 * Idempotent: every resource is upserted by slug (derived from title).
 */

import "dotenv/config";
import { CURATED_RESOURCES } from "../lib/seed/curated-resources";
import { ingestMany } from "../lib/ingest/pipeline";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set. Set it in your .env, then run\n" +
        "  npm run db:migrate\n" +
        "  npm run db:seed       # allowlist (sources)\n" +
        "  npm run db:seed-tags  # taxonomy\n" +
        "  npm run db:seed-resources",
    );
    process.exit(2);
  }

  console.log(`Seeding ${CURATED_RESOURCES.length} curated resources...`);
  console.log("  Anthropic auto-tagger:", process.env.ANTHROPIC_API_KEY ? "ENABLED" : "disabled (heuristic only)");
  console.log("  OpenAI embeddings    :", process.env.OPENAI_API_KEY ? "ENABLED" : "disabled (chunks stored without vectors)");
  console.log("");

  const summary = await ingestMany(CURATED_RESOURCES);

  console.log("");
  console.log(`Upserted: ${summary.upserted}`);
  if (summary.skipped.length > 0) {
    console.log(`Skipped : ${summary.skipped.length}`);
    for (const s of summary.skipped) console.log(`  · ${s.title}\n      ${s.reason}`);
  }
  console.log("");
  console.log("Resources seeded as is_published=false. Approve them via the admin");
  console.log("UI (or set is_published=true in the DB directly) before they appear");
  console.log("on the public catalog.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
