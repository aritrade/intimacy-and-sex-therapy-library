import { NextResponse } from "next/server";
import { listCatalog, searchChunksByText } from "@/lib/db/queries";
import { hybridRetrieve } from "@/lib/search/hybrid";
import { expandHinglishQuery } from "@/lib/search/hinglish";

/**
 * Public search endpoint. Hybrid (pgvector + tsvector + RRF) when DATABASE_URL
 * and OPENAI_API_KEY are set; otherwise falls back to text-only.
 *
 * Hinglish-aware: query is expanded against a curator-maintained synonym map
 * before being passed to the BM25 path so users typing "pati ki napunsakta"
 * still hit "erectile dysfunction" content.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const topic = url.searchParams.get("topic") ?? undefined;
  const difficulty = url.searchParams.get("difficulty") ?? undefined;

  if (!q && !topic && !difficulty) {
    return NextResponse.json({ error: "missing_query" }, { status: 400 });
  }

  const { expanded, extraTerms } = q ? expandHinglishQuery(q) : { expanded: "", extraTerms: [] };
  const effectiveQ = expanded || q;

  const [catalog, vectorOrText] = await Promise.all([
    listCatalog({ q: effectiveQ, topic, difficulty, limit: 20 }),
    q
      ? hybridRetrieve({ query: effectiveQ, topK: 8 }).then((hits) =>
          hits.length > 0 ? hits : searchChunksByText(effectiveQ, 8),
        )
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    query: q,
    expandedQuery: expanded || null,
    extraTerms,
    catalog,
    chunks: vectorOrText,
  });
}
