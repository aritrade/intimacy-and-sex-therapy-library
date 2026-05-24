/**
 * Unified corpus retriever for chat-grounding.
 *
 * Tries hybrid (vector + BM25) chunk search first. When the chunks table is
 * empty (no full-text ingestion has run yet) we fall back to a BM25-style
 * search over the catalog itself — title + abstract + curator notes —
 * so /chat can still answer questions from the 35 seeded resources before
 * we run any PDF/transcript ingestion.
 *
 * Returns a uniform shape ("CorpusHit") regardless of source so callers
 * (the chat route) can build the same numbered-context prompt.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resources, sources } from "@/lib/db/schema";
import { hybridRetrieve, type RetrievedChunk } from "./hybrid";

export type CorpusHit = {
  /** 1-based citation number used inline as [n]. Filled in by buildContext. */
  n?: number;
  resourceSlug: string;
  resourceTitle: string;
  authors: string[];
  year: number | null;
  sourceName: string;
  externalUrl: string;
  /** A passage to ground the answer. <= 1500 chars. */
  snippet: string;
  pageNum?: number | null;
  timestampSeconds?: number | null;
};

export async function corpusRetrieve(opts: {
  query: string;
  topK?: number;
  scopedResourceId?: string;
}): Promise<CorpusHit[]> {
  if (!process.env.DATABASE_URL) return [];

  const topK = opts.topK ?? 6;

  // 1) Try the chunks table first.
  const chunksHit = await hybridRetrieve({
    query: opts.query,
    topK,
    scopedResourceId: opts.scopedResourceId,
  });
  if (chunksHit.length > 0) {
    return chunksHit.map((c: RetrievedChunk) => ({
      resourceSlug: c.resourceSlug,
      resourceTitle: c.resourceTitle,
      authors: c.authors,
      year: c.publishedYear,
      sourceName: c.sourceName,
      externalUrl: c.externalUrl,
      snippet: c.content.slice(0, 1500),
      pageNum: c.pageNum,
      timestampSeconds: c.timestampSeconds,
    }));
  }

  // 2) No chunks ingested yet: fall back to catalog-level search.
  return catalogFallback(opts.query, topK, opts.scopedResourceId);
}

/**
 * BM25 over title + summary (abstract) + curator_notes from the resources
 * table. Uses Postgres `to_tsvector` directly so we don't need a precomputed
 * tsvector column on resources.
 *
 * Two-stage retrieval to handle natural-language input gracefully:
 *
 *   Stage 1: `websearch_to_tsquery` — accepts the user's phrasing literally,
 *            but combines all non-stop words with AND. Misses if any single
 *            content word doesn't appear in any abstract.
 *   Stage 2: extract content words ourselves, build an OR-query with
 *            `to_tsquery`. Catches questions like "How is vaginismus typically
 *            treated?" where only "vaginismus" is in the corpus.
 *   Stage 3: last-3 by recency as a final guard rail (rare).
 */
async function catalogFallback(
  query: string,
  topK: number,
  scopedResourceId?: string
): Promise<CorpusHit[]> {
  const where = [eq(resources.isPublished, true)];
  if (scopedResourceId) where.push(eq(resources.id, scopedResourceId));

  const tsv = sql<unknown>`to_tsvector('english',
    coalesce(${resources.title}, '') || ' ' ||
    coalesce(${resources.summary}, '') || ' ' ||
    coalesce(${resources.curatorNotes}, '')
  )`;

  async function runWithTsquery(tsq: ReturnType<typeof sql>) {
    const rankExpr = sql<number>`ts_rank_cd(${tsv}, ${tsq})`;
    return db
      .select({
        slug: resources.slug,
        title: resources.title,
        authors: resources.authors,
        publishedAt: resources.publishedAt,
        summary: resources.summary,
        curatorNotes: resources.curatorNotes,
        externalUrl: resources.externalUrl,
        sourceName: sources.name,
        rank: rankExpr,
      })
      .from(resources)
      .innerJoin(sources, eq(resources.sourceId, sources.id))
      .where(and(...where))
      .orderBy(sql`${rankExpr} DESC`)
      .limit(topK);
  }

  // Stage 1: literal user phrasing.
  let rows = await runWithTsquery(sql`websearch_to_tsquery('english', ${query})`);
  let matched = rows.filter((r) => Number(r.rank) > 0);

  // Stage 2: OR over extracted content words.
  if (matched.length === 0) {
    const contentWords = extractContentWords(query);
    if (contentWords.length > 0) {
      const orExpr = contentWords.join(" | ");
      rows = await runWithTsquery(sql`to_tsquery('english', ${orExpr})`);
      matched = rows.filter((r) => Number(r.rank) > 0);
    }
  }

  // Stage 3: last-3 by recency so the model has _something_ to read.
  const final = matched.length > 0 ? matched : rows.slice(0, 3);

  return final.map((r) => {
    const snippet = `${r.summary ?? ""}${
      r.curatorNotes ? `\n\nCurator notes: ${r.curatorNotes}` : ""
    }`.slice(0, 1500);
    return {
      resourceSlug: r.slug,
      resourceTitle: r.title,
      authors: (r.authors as string[]) ?? [],
      year: r.publishedAt ? new Date(r.publishedAt).getFullYear() : null,
      sourceName: r.sourceName,
      externalUrl: r.externalUrl,
      snippet,
    };
  });
}

/**
 * Extract content words from a natural-language query for the OR-fallback.
 *
 * Strategy:
 *   - Lowercase, split on non-letter characters.
 *   - Drop a generous stop-word list (interrogatives, auxiliaries, fillers).
 *   - Drop tokens shorter than 3 chars.
 *   - Escape any tokens that contain ts_query operators (defense in depth —
 *     we already filter to letters only).
 */
const STOPWORDS = new Set([
  "the","a","an","of","to","in","on","at","for","with","by","is","are","was",
  "were","be","been","being","do","does","did","have","has","had","will",
  "would","should","could","can","may","might","must","shall","this","that",
  "these","those","i","you","he","she","it","we","they","me","him","her","us",
  "them","my","your","our","their","what","which","who","whom","when","where",
  "why","how","whose","there","here","just","like","so","as","if","not","no",
  "but","or","and","then","than","also","very","really","much","many","some",
  "any","all","none","more","most","less","least","typically","usually",
  "generally","often","sometimes","always","never","ever","please","tell",
  "explain","help","talk","think","mean","means","meaning","one","two","get",
  "got","know","feel","feels","feeling","felt",
]);

function extractContentWords(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Render hits as a numbered context block to inject into the system prompt.
 * Mutates `hits` in place to assign `n` so the chat route can render the
 * "Sources" footer with the same numbering after the model finishes.
 */
export function buildContextBlock(hits: CorpusHit[]): string {
  if (hits.length === 0) {
    return "(The library has no matching passages for this question.)";
  }
  return hits
    .map((h, i) => {
      h.n = i + 1;
      const cite = [
        h.resourceTitle,
        h.authors.length > 0 ? h.authors.slice(0, 3).join(", ") : null,
        h.year ? String(h.year) : null,
        h.sourceName,
      ]
        .filter(Boolean)
        .join(" — ");
      return `[${i + 1}] ${cite}\n${h.snippet}`;
    })
    .join("\n\n---\n\n");
}
