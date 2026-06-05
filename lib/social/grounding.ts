/**
 * RAG grounding for script generation.
 *
 * Wraps the existing hybrid retriever (lib/search/hybrid.ts) so the script
 * generator can ground its claims in the validated corpus instead of
 * hallucinating. Soft policy: when no evidence is found (empty corpus, no
 * embeddings key, off-topic brief) we return `lowGrounding: true` and the
 * caller generates as before — but the draft is flagged for closer review.
 */

import { hybridRetrieve, type RetrievedChunk } from "@/lib/search/hybrid";

export type EvidenceSource = {
  title: string;
  url: string;
  year: number | null;
  authors: string[];
  sourceName: string;
};

export type GroundingResult = {
  /** Top-K retrieved chunks, best first. Empty when nothing matched. */
  chunks: RetrievedChunk[];
  /** Deduped owning resources, in chunk-rank order. */
  sources: EvidenceSource[];
  /** Suggested on-screen citation line from the top source, or null. */
  citation: string | null;
  /** Aggregate confidence in [0,1]; 0 when nothing was retrieved. */
  score: number;
  /** True when generation should fall back to the ungrounded path. */
  lowGrounding: boolean;
};

export type RetrieveEvidenceOptions = {
  /** Free-text brief used as the retrieval query. */
  briefText: string;
  /** Optional topic slug appended to the query to sharpen retrieval. */
  topicSlug?: string;
  /** Number of evidence chunks to keep. Default 5. */
  topK?: number;
};

const DEFAULT_TOP_K = 5;

/** Build a one-line citation from a source, e.g. "Authors (2021) — Source". */
function citationFor(s: EvidenceSource): string {
  const author = s.authors[0]
    ? s.authors.length > 1
      ? `${s.authors[0]} et al.`
      : s.authors[0]
    : s.sourceName;
  const year = s.year ? ` (${s.year})` : "";
  const title = s.title.length > 80 ? `${s.title.slice(0, 77)}…` : s.title;
  return `${author}${year} — ${title}`;
}

export async function retrieveEvidence(
  opts: RetrieveEvidenceOptions,
): Promise<GroundingResult> {
  const topK = opts.topK ?? DEFAULT_TOP_K;
  const query = [opts.briefText, opts.topicSlug?.replace(/-/g, " ")]
    .filter(Boolean)
    .join(" ")
    .trim();

  let chunks: RetrievedChunk[] = [];
  try {
    chunks = await hybridRetrieve({ query, topK });
  } catch {
    // Retrieval must never break generation; degrade to ungrounded.
    chunks = [];
  }

  if (chunks.length === 0) {
    return { chunks: [], sources: [], citation: null, score: 0, lowGrounding: true };
  }

  const seen = new Set<string>();
  const sources: EvidenceSource[] = [];
  for (const c of chunks) {
    if (seen.has(c.resourceId)) continue;
    seen.add(c.resourceId);
    sources.push({
      title: c.resourceTitle,
      url: c.externalUrl,
      year: c.publishedYear,
      authors: c.authors ?? [],
      sourceName: c.sourceName,
    });
  }

  // Aggregate score: normalise the summed RRF scores into a rough [0,1]
  // confidence. Two solid matches already clears the low-grounding bar.
  const summed = chunks.reduce((acc, c) => acc + c.score, 0);
  const score = Math.min(1, summed / 0.1);
  const lowGrounding = chunks.length < 2 || score < 0.25;

  return {
    chunks,
    sources,
    citation: sources[0] ? citationFor(sources[0]) : null,
    score: Number(score.toFixed(3)),
    lowGrounding,
  };
}

/**
 * Format retrieved chunks into an EVIDENCE block for the LLM prompt. Bounded
 * by `maxChunks` and `maxCharsPerChunk` so the prompt stays within every
 * provider's context window (the local Ollama models cap at ~4k tokens) and
 * keeps hosted-token costs predictable.
 */
export function formatEvidenceBlock(
  chunks: RetrievedChunk[],
  maxChunks = 4,
  maxCharsPerChunk = 450,
): string {
  if (chunks.length === 0) return "";
  const items = chunks.slice(0, maxChunks).map((c, i) => {
    const author = c.authors?.[0] ?? c.sourceName;
    const year = c.publishedYear ? `, ${c.publishedYear}` : "";
    const body = c.content.replace(/\s+/g, " ").trim().slice(0, maxCharsPerChunk);
    return `[${i + 1}] ${author}${year} — "${c.resourceTitle}" (${c.sourceName})\n${body}`;
  });
  return items.join("\n\n");
}
