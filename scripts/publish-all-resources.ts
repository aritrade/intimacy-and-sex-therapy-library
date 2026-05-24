/**
 * Local-review helper: flips every seeded resource to is_published=true
 * so the catalog populates without manually clicking through /admin.
 *
 * In production you'd never use this — clinical/editor approval is required.
 */
import "dotenv/config";
import { db } from "../lib/db/client";
import { resources } from "../lib/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  const before = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(resources);
  const result = await db
    .update(resources)
    .set({ isPublished: true, publishedAt: new Date() })
    .returning({ id: resources.id });
  console.log(`Published ${result.length} of ${before[0]?.count ?? 0} resources.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
