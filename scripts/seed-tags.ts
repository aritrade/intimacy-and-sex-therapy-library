import "dotenv/config";
import { db } from "../lib/db/client";
import { tags } from "../lib/db/schema";
import { TAXONOMY } from "../lib/ingest/topics";

async function main() {
  const rows: Array<{ name: string; category: "topic" | "difficulty" | "population" | "modality"; description: string | null }> = [];

  for (const t of TAXONOMY.topics) rows.push({ name: t.name, category: "topic", description: t.description });
  for (const p of TAXONOMY.populations) rows.push({ name: p.name, category: "population", description: p.description });
  for (const m of TAXONOMY.modalities) rows.push({ name: m.name, category: "modality", description: m.description });
  for (const d of TAXONOMY.difficulty) rows.push({ name: d, category: "difficulty", description: null });

  console.log(`Seeding ${rows.length} tags...`);
  for (const row of rows) {
    await db.insert(tags).values(row).onConflictDoNothing();
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
