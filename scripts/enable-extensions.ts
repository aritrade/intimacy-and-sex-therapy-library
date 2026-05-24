/**
 * One-shot helper to enable pgvector + pg_trgm on a fresh DB.
 * Idempotent. Used as a pre-migration hook for environments where the
 * Neon SQL editor wasn't run beforehand.
 */
import "dotenv/config";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(2);
  }
  const client = postgres(url, { max: 1, prepare: false });
  await client`CREATE EXTENSION IF NOT EXISTS vector`;
  await client`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
  const r = await client`select extname from pg_extension where extname in ('vector','pg_trgm') order by extname`;
  console.log("Enabled extensions:", r.map((x) => x.extname).join(", "));
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
