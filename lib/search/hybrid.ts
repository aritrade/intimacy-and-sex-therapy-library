/**
 * Hybrid retriever: pgvector cosine + tsvector BM25 + Reciprocal Rank Fusion.
 *
 * Returns the top-k chunks plus their owning resource. Each chunk carries
 * page or timestamp metadata so the chatbot can deep-link.
 *
 * Falls back gracefully when DATABASE_URL is unset (returns []).
 * Vector search is skipped when OPENAI_API_KEY is unset; we still get BM25.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chunks, resources, sources } from "@/lib/db/schema";
import { embedBatch } from "@/lib/ai/embeddings";

export type RetrievedChunk = {
  chunkId: string;
  resourceId: string;
  resourceSlug: string;
  resourceTitle: string;
  authors: string[];
  publishedYear: number | null;
  sourceName: string;
  externalUrl: string;
  content: string;
  pageNum: number | null;
  timestampSeconds: number | null;
  score: number;
  matchedBy: ("vector" | "bm25")[];
};

export type RetrieveOptions = {
  query: string;
  topK?: number;
  scopedResourceId?: string;
  rrfK?: number;
};

const VECTOR_POOL = 50;
const BM25_POOL = 50;
const DEFAULT_K = 8;
const DEFAULT_RRF_K = 60;

export async function hybridRetrieve(opts: RetrieveOptions): Promise<RetrievedChunk[]> {
  if (!process.env.DATABASE_URL) return [];
  const q = opts.query.trim();
  if (!q) return [];

  const topK = opts.topK ?? DEFAULT_K;
  const rrfK = opts.rrfK ?? DEFAULT_RRF_K;

  const [vectorRanked, bm25Ranked] = await Promise.all([
    vectorSearch(q, VECTOR_POOL, opts.scopedResourceId),
    bm25Search(q, BM25_POOL, opts.scopedResourceId),
  ]);

  const fused = rrfFuse(vectorRanked, bm25Ranked, rrfK).slice(0, topK);
  if (fused.length === 0) return [];

  const ids = fused.map((f) => f.chunkId);
  const enriched = await db
    .select({
      chunkId: chunks.id,
      resourceId: resources.id,
      resourceSlug: resources.slug,
      resourceTitle: resources.title,
      authors: resources.authors,
      publishedAt: resources.publishedAt,
      sourceName: sources.name,
      externalUrl: resources.externalUrl,
      content: chunks.content,
      pageNum: chunks.pageNum,
      timestampSeconds: chunks.timestampSeconds,
    })
    .from(chunks)
    .innerJoin(resources, eq(chunks.resourceId, resources.id))
    .innerJoin(sources, eq(resources.sourceId, sources.id))
    .where(and(inArray(chunks.id, ids), eq(resources.isPublished, true)));

  const byId = new Map(enriched.map((r) => [r.chunkId, r]));

  return fused
    .map((f) => {
      const e = byId.get(f.chunkId);
      if (!e) return null;
      return {
        chunkId: e.chunkId,
        resourceId: e.resourceId,
        resourceSlug: e.resourceSlug,
        resourceTitle: e.resourceTitle,
        authors: (e.authors as string[]) ?? [],
        publishedYear: e.publishedAt ? new Date(e.publishedAt).getFullYear() : null,
        sourceName: e.sourceName,
        externalUrl: e.externalUrl,
        content: e.content,
        pageNum: e.pageNum,
        timestampSeconds: e.timestampSeconds,
        score: f.score,
        matchedBy: f.matchedBy,
      } satisfies RetrievedChunk;
    })
    .filter((x): x is RetrievedChunk => x !== null);
}

type Ranked = { chunkId: string; rank: number };

async function vectorSearch(
  q: string,
  k: number,
  scope?: string,
): Promise<Ranked[]> {
  const embed = await embedBatch([q]);
  if (!embed || embed.embeddings.length === 0) return [];
  const vec = `[${embed.embeddings[0].join(",")}]`;

  const rows = scope
    ? await db.execute(sql`
        SELECT c.id::text as id
        FROM chunks c
        JOIN resources r ON r.id = c.resource_id
        WHERE r.id = ${scope}::uuid AND r.is_published = TRUE
        ORDER BY c.embedding <=> ${vec}::vector
        LIMIT ${k}
      `)
    : await db.execute(sql`
        SELECT c.id::text as id
        FROM chunks c
        JOIN resources r ON r.id = c.resource_id
        WHERE r.is_published = TRUE
        ORDER BY c.embedding <=> ${vec}::vector
        LIMIT ${k}
      `);

  return (rows as unknown as Array<{ id: string }>).map((r, i) => ({
    chunkId: r.id,
    rank: i,
  }));
}

async function bm25Search(q: string, k: number, scope?: string): Promise<Ranked[]> {
  const tsq = sql`websearch_to_tsquery('english', ${q})`;
  const rows = scope
    ? await db.execute(sql`
        SELECT c.id::text as id
        FROM chunks c
        JOIN resources r ON r.id = c.resource_id
        WHERE r.id = ${scope}::uuid AND r.is_published = TRUE AND c.tsv @@ ${tsq}
        ORDER BY ts_rank_cd(c.tsv, ${tsq}) DESC
        LIMIT ${k}
      `)
    : await db.execute(sql`
        SELECT c.id::text as id
        FROM chunks c
        JOIN resources r ON r.id = c.resource_id
        WHERE r.is_published = TRUE AND c.tsv @@ ${tsq}
        ORDER BY ts_rank_cd(c.tsv, ${tsq}) DESC
        LIMIT ${k}
      `);

  return (rows as unknown as Array<{ id: string }>).map((r, i) => ({
    chunkId: r.id,
    rank: i,
  }));
}

/**
 * Reciprocal Rank Fusion. score(d) = sum_{r in lists} 1 / (k + rank_r(d))
 * Simple, robust, and provider-neutral.
 *
 * Exported so the unit suite can verify ordering invariants without a DB.
 */
export function rrfFuse(
  vector: Ranked[],
  bm25: Ranked[],
  k: number,
): Array<{ chunkId: string; score: number; matchedBy: ("vector" | "bm25")[] }> {
  const map = new Map<
    string,
    { score: number; matchedBy: Set<"vector" | "bm25"> }
  >();

  for (const r of vector) {
    const cur = map.get(r.chunkId) ?? { score: 0, matchedBy: new Set() };
    cur.score += 1 / (k + r.rank + 1);
    cur.matchedBy.add("vector");
    map.set(r.chunkId, cur);
  }
  for (const r of bm25) {
    const cur = map.get(r.chunkId) ?? { score: 0, matchedBy: new Set() };
    cur.score += 1 / (k + r.rank + 1);
    cur.matchedBy.add("bm25");
    map.set(r.chunkId, cur);
  }

  return [...map.entries()]
    .map(([chunkId, v]) => ({
      chunkId,
      score: v.score,
      matchedBy: [...v.matchedBy],
    }))
    .sort((a, b) => b.score - a.score);
}
