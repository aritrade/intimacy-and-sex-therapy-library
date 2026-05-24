import "dotenv/config";
import { corpusRetrieve, buildContextBlock } from "../lib/search/corpus";

async function main() {
  const queries = [
    "How is vaginismus typically treated?",
    "vaginismus",
    "What is erectile dysfunction?",
    "couple counselling",
  ];
  for (const q of queries) {
    const hits = await corpusRetrieve({ query: q, topK: 5 });
    console.log(`\n=== ${q}  (${hits.length} hits) ===`);
    for (const h of hits) {
      console.log(`  - ${h.resourceTitle} :: ${h.snippet.slice(0, 80)}...`);
    }
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
