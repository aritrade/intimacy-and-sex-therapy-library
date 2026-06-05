/**
 * Discover flywheel: when Discover surfaces an open-access Europe PMC article
 * we don't already have, ingest its full text so it becomes a first-class,
 * readable library item over time.
 *
 * Embeddings are intentionally skipped here — the daily `backfill-embeddings`
 * GitHub Action embeds NULL chunks under Gemini's rate limits (same decoupling
 * as scripts/seed-corpus.ts). Resources that yield chunks are auto-published,
 * consistent with the seeder. Dedup is by canonical external URL.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resources } from "@/lib/db/schema";
import { fetchFullText } from "@/lib/ingest/sources/pmc";
import { ingestMany, type IngestRecord } from "@/lib/ingest/pipeline";
import { log } from "@/lib/observability/logger";
import { canonicalUrl, type Candidate } from "./sources";

const MAX_PER_RUN = 3;

async function knownExternalUrls(): Promise<Set<string>> {
  const rows = await db.select({ externalUrl: resources.externalUrl }).from(resources);
  return new Set(rows.map((r) => canonicalUrl(r.externalUrl)));
}

/**
 * Ingest up to `MAX_PER_RUN` new OA articles from a Discover result. Best-effort
 * and bounded; never throws into the caller (Discover must still return).
 */
export async function ingestDiscoverFinds(ingestable: Candidate[]): Promise<{ ingested: number }> {
  if (!process.env.DATABASE_URL || ingestable.length === 0) return { ingested: 0 };

  try {
    const known = await knownExternalUrls();
    const fresh = ingestable
      .filter((c) => c.pmcHit && !known.has(canonicalUrl(c.url)))
      .slice(0, MAX_PER_RUN);
    if (fresh.length === 0) return { ingested: 0 };

    const records: IngestRecord[] = [];
    for (const c of fresh) {
      const hit = c.pmcHit!;
      const body = (await fetchFullText(hit).catch(() => null)) ?? undefined;
      if (!body) continue; // only keep articles we can actually chunk
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
    if (records.length === 0) return { ingested: 0 };

    await ingestMany(records, { skipEmbeddings: true });

    // Auto-publish freshly ingested pmc-oa resources that produced chunks.
    const published = (await db.execute(sql`
      update resources r
         set is_published = true, updated_at = now()
       where r.source_id = (select id from sources where slug = 'pmc-oa')
         and r.is_published = false
         and exists (select 1 from chunks c where c.resource_id = r.id)
      returning r.id
    `)) as unknown as Array<{ id: string }>;

    log.info("discover_flywheel_ingest", {
      candidates: fresh.length,
      ingested: records.length,
      published: published.length,
    });
    return { ingested: records.length };
  } catch (e) {
    log.warn("discover_flywheel_failed", { reason: String((e as Error).message).slice(0, 200) });
    return { ingested: 0 };
  }
}
