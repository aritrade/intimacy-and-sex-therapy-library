/**
 * One-off cleanup: remove duplicate chunks created by re-running an ingest
 * before the pipeline cleared prior chunks. Duplicates share (resource_id, ord)
 * because re-chunking the same body reproduces the same ordinal sequence.
 *
 * For each (resource_id, ord) we keep exactly one row, preferring one that
 * already has an embedding (so we don't discard backfill work), then the
 * lowest id. Safe to run repeatedly — it's a no-op once deduped.
 *
 *   npm run dedupe:chunks            # delete duplicates
 *   npm run dedupe:chunks -- --dry   # report only, change nothing
 */

import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../lib/db/client";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(2);
  }
  const dry = process.argv.includes("--dry");

  const before = (await db.execute(sql`
    select
      count(*)::int as total,
      count(*) filter (where embedding is null)::int as unembedded
    from chunks
  `)) as unknown as Array<{ total: number; unembedded: number }>;

  const dupeRows = (await db.execute(sql`
    select count(*)::int as dupes from (
      select id, row_number() over (
        partition by resource_id, ord
        order by (embedding is not null) desc, id asc
      ) as rn
      from chunks
    ) t
    where t.rn > 1
  `)) as unknown as Array<{ dupes: number }>;

  console.log("before:", before[0], "duplicate rows to remove:", dupeRows[0].dupes);

  if (dry) {
    console.log("--dry: no changes made.");
    process.exit(0);
  }

  if (dupeRows[0].dupes > 0) {
    await db.execute(sql`
      delete from chunks where id in (
        select id from (
          select id, row_number() over (
            partition by resource_id, ord
            order by (embedding is not null) desc, id asc
          ) as rn
          from chunks
        ) t
        where t.rn > 1
      )
    `);
  }

  const after = (await db.execute(sql`
    select
      count(*)::int as total,
      count(*) filter (where embedding is null)::int as unembedded
    from chunks
  `)) as unknown as Array<{ total: number; unembedded: number }>;

  console.log("after:", after[0]);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
