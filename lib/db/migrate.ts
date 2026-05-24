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

  console.log("Applying hand-written index migration (pgvector + GIN)...");
  const sqlPath = join(process.cwd(), "drizzle", "0001_indexes.sql");
  await client.unsafe(readFileSync(sqlPath, "utf8"));

  // Phase 13: append-only reviewer feedback column. Idempotent.
  console.log("Applying reviewer-notes migration (Phase 13)...");
  const reviewerSql = join(process.cwd(), "drizzle", "0002_reviewer_notes.sql");
  await client.unsafe(readFileSync(reviewerSql, "utf8"));

  console.log("Migrations complete.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
