import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HAND_WRITTEN_MIGRATIONS } from "./hand-written-migrations";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);

  console.log("Running drizzle-kit generated migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });

  // Hand-written migrations drizzle-kit doesn't model well (extensions,
  // pgvector index, idempotent ALTERs). Applied in order, all idempotent.
  for (const [label, file] of HAND_WRITTEN_MIGRATIONS) {
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
