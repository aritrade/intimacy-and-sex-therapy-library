import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);

  console.log("Running drizzle-kit generated migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });

  // Hand-written migrations drizzle-kit doesn't model well (extensions,
  // pgvector index, idempotent ALTERs). Applied in order, all idempotent.
  const handWritten = [
    ["pgvector + GIN indexes", "0001_indexes.sql"],
    ["reviewer-notes column (Phase 13)", "0002_reviewer_notes.sql"],
    ["embeddings -> Gemini 768-dim", "0005_vector_768.sql"],
    ["content_drafts.grounding column", "0006_grounding.sql"],
    ["content_drafts.archived_at column", "0007_archive_drafts.sql"],
    ["email_subscribers table", "0008_email_subscribers.sql"],
    ["page_views table", "0009_page_views.sql"],
    ["help search cache + flags", "0010_help_search.sql"],
    ["widen assessment_results.severity", "0011_assessment_severity_widen.sql"],
  ] as const;

  for (const [label, file] of handWritten) {
    console.log(`Applying hand-written migration: ${label} (${file})...`);
    await client.unsafe(readFileSync(join(process.cwd(), "drizzle", file), "utf8"));
  }

  console.log("Migrations complete.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
