import "dotenv/config";
import { db } from "../lib/db/client";
import { sources } from "../lib/db/schema";
import { ALLOWLIST } from "../lib/ingest/allowlist";

async function main() {
  console.log(`Seeding ${ALLOWLIST.length} sources...`);
  for (const src of ALLOWLIST) {
    await db
      .insert(sources)
      .values({
        slug: src.slug,
        name: src.name,
        kind: src.kind,
        url: src.url,
        trustTier: src.trustTier,
        notes: src.notes ?? null,
      })
      .onConflictDoUpdate({
        target: sources.slug,
        set: {
          name: src.name,
          kind: src.kind,
          url: src.url,
          trustTier: src.trustTier,
          notes: src.notes ?? null,
        },
      });
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
