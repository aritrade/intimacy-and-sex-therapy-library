import "dotenv/config";
import { db } from "../lib/db/client";
import { chunks, resources } from "../lib/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  const r = await db.select({ n: sql<number>`count(*)::int` }).from(resources);
  const c = await db.select({ n: sql<number>`count(*)::int` }).from(chunks);
  console.log(`resources: ${r[0]?.n}, chunks: ${c[0]?.n}`);
  process.exit(0);
}
main();
