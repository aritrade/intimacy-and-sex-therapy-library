/**
 * Topic-aligned corpus seeder for RAG grounding.
 *
 *   npm run seed:corpus                 # ingest + publish (no embed) for all topics
 *   npm run seed:corpus -- --limit=4    # OA hits to keep per query (default 4)
 *   npm run seed:corpus -- --topic=vaginismus   # one topic slug only
 *
 * Why this exists: generated scripts only ground when retrieveEvidence() finds
 * matching chunks. The content briefs span ~30 topic slugs; this script pulls
 * open-access, full-text articles from Europe PMC for each, ingests them, and
 * publishes the ones that produced chunks so they're retrievable.
 *
 * IMPORTANT — embeddings are intentionally DECOUPLED. Gemini's free embedding
 * tier is rate-limited, and a long inline-embed ingest fails partway. So this
 * seeder ingests WITHOUT embedding (chunks stored, embedding NULL), then you
 * run the resumable backfill:
 *
 *   npm run seed:corpus
 *   npm run backfill:embeddings        # embeds all NULL chunks, resumable
 *
 * Each query maps to a content-briefs.ts topicSlug so coverage is auditable.
 */

import "dotenv/config";
// Force the ingest pipeline down its no-embedding path: it checks
// embeddingsEnabled() (GEMINI_API_KEY presence) per resource. We embed later
// via backfill:embeddings, which throttles correctly. This MUST run before any
// pipeline import reads the key.
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

import { sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import { fetchFullText, searchEuropePmc, type PmcHit } from "../lib/ingest/sources/pmc";
import { ingestMany, type IngestRecord } from "../lib/ingest/pipeline";

/**
 * topicSlug -> Europe PMC queries. Slugs match lib/social/content-briefs.ts.
 * Queries favour clinical review/therapy terms that tend to have OA full text.
 */
const TOPIC_QUERIES: Record<string, string[]> = {
  "low-desire": [
    "responsive desire sexual",
    "sexual desire discrepancy couples",
    "dual control model sexual response",
    "arousal nonconcordance",
  ],
  "couples-counselling": [
    "sensate focus sex therapy",
    "emotional intimacy couples relationship satisfaction",
    "Gottman couples relationship",
  ],
  vaginismus: ["vaginismus treatment", "genito-pelvic pain penetration disorder"],
  "erectile-difficulties": ["erectile dysfunction performance anxiety", "psychogenic erectile dysfunction therapy"],
  "asexual-spectrum": ["asexuality orientation", "asexual identity wellbeing"],
  "lgbtq-affirmative": ["affirmative therapy sexual minority couples", "minority stress same-sex couples"],
  trauma: ["sexual trauma intimacy survivors", "window of tolerance trauma"],
  "porn-related-distress": ["perceived pornography problematic use distress", "moral incongruence pornography"],
  consent: ["sexual consent communication couples", "ongoing sexual consent relationship"],
  "open-relationships": ["consensual non-monogamy relationship", "polyamory relationship satisfaction"],
  postpartum: ["postpartum sexual function", "postpartum sexual health couples"],
  "what-is-sex-therapy": ["sex therapy efficacy outcome", "psychosexual therapy intervention"],
  "shame-and-guilt": ["sexual shame guilt intimacy", "shame relationship conflict"],
  communication: ["sexual communication couples satisfaction", "sexual self-disclosure relationship"],
  "orgasm-gap": ["orgasm gap heterosexual", "women orgasm partnered sex"],
  "mindfulness-intimacy": ["mindfulness sexual function women", "mindfulness based sex therapy"],
  "medication-and-desire": ["antidepressant sexual dysfunction SSRI", "SSRI sexual side effects management"],
  "pelvic-floor": ["pelvic floor dysfunction sexual", "pelvic floor physiotherapy sexual pain"],
  "performance-anxiety": ["sexual performance anxiety treatment", "spectatoring sexual anxiety"],
  "pregnancy-loss": ["pregnancy loss couples intimacy grief", "miscarriage sexual relationship"],
  "premature-ejaculation": ["premature ejaculation behavioural treatment", "premature ejaculation therapy"],
  anorgasmia: ["anorgasmia women treatment", "female orgasmic disorder therapy"],
  perimenopause: ["perimenopause sexual function", "menopause sexual desire vaginal"],
  "intimacy-rituals": ["affection rituals relationship satisfaction", "physical affection couples wellbeing"],
  boundaries: ["boundaries relationship wellbeing", "assertiveness intimate relationship"],
  "india-context": ["sexual health India couples", "sexual dysfunction India clinic"],
  "men-and-intimacy": ["men emotional intimacy relationship", "masculinity intimacy relationship"],
  "infidelity-recovery": ["infidelity couple therapy recovery", "relationship repair after affair"],
  "coming-out": ["coming out later life identity", "sexual identity disclosure midlife"],
  "disability-and-intimacy": ["disability sexuality intimacy", "sexual health disability"],
  attachment: ["attachment style sexual relationship", "adult attachment intimacy"],
};

function flag(name: string, fallback?: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split("=").slice(1).join("=") : fallback;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(2);
  }
  const limit = Number(flag("limit", "4"));
  const onlyTopic = flag("topic");

  const topics = onlyTopic
    ? { [onlyTopic]: TOPIC_QUERIES[onlyTopic] ?? [] }
    : TOPIC_QUERIES;

  const seenUrls = new Set<string>();
  const records: IngestRecord[] = [];

  for (const [topic, queries] of Object.entries(topics)) {
    if (!queries || queries.length === 0) {
      console.log(`[${topic}] no queries — skipping`);
      continue;
    }
    let topicHits = 0;
    for (const query of queries) {
      let hits: PmcHit[] = [];
      try {
        hits = await searchEuropePmc({ query, limit });
      } catch (e) {
        console.log(`  [${topic}] "${query}" search failed: ${String((e as Error).message).slice(0, 80)}`);
        continue;
      }
      let withText = 0;
      for (const hit of hits) {
        if (seenUrls.has(hit.externalUrl)) continue;
        const body = (await fetchFullText(hit)) ?? undefined;
        if (!body) continue; // only keep articles we can actually chunk/embed
        seenUrls.add(hit.externalUrl);
        withText += 1;
        topicHits += 1;
        records.push({
          sourceSlug: "pmc-oa",
          title: hit.title,
          authors: hit.authors,
          authorCredentials: [],
          publishedAt: hit.publishedYear ? new Date(`${hit.publishedYear}-01-01`) : undefined,
          language: "en",
          license: hit.license,
          externalUrl: hit.externalUrl,
          abstract: hit.abstract,
          body,
          kind: "article",
        });
      }
      console.log(`  [${topic}] "${query}" → ${hits.length} hits, ${withText} with full text`);
    }
    console.log(`[${topic}] total kept: ${topicHits}`);
  }

  console.log(`\nIngesting ${records.length} records (no embedding — run backfill:embeddings next)…`);
  const summary = await ingestMany(records);
  console.log(`Upserted: ${summary.upserted}, skipped: ${summary.skipped.length}`);

  // Publish pmc-oa resources that produced at least one chunk so they're
  // retrievable. Embeddings get added afterwards by backfill:embeddings.
  const published = (await db.execute(sql`
    update resources r
       set is_published = true, updated_at = now()
     where r.source_id = (select id from sources where slug = 'pmc-oa')
       and r.is_published = false
       and exists (select 1 from chunks c where c.resource_id = r.id)
    returning r.id
  `)) as unknown as Array<{ id: string }>;
  console.log(`Published ${published.length} resource(s) that have chunks.`);

  const counts = (await db.execute(sql`
    select
      (select count(*)::int from chunks) as chunks_total,
      (select count(*)::int from chunks where embedding is null) as chunks_unembedded,
      (select count(*)::int from resources where is_published) as resources_published
  `)) as unknown as Array<Record<string, number>>;
  console.log("corpus now:", counts[0]);
  console.log("\nNext: npm run backfill:embeddings");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
