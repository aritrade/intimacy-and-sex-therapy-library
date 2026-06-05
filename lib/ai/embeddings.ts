/**
 * Embeddings via Google Gemini `gemini-embedding-001` (768-dim, free tier).
 *
 * Called via the REST API directly (rather than @ai-sdk/google) so we can
 * pass `outputDimensionality` and `taskType`, and L2-normalize the result —
 * Gemini only returns pre-normalized vectors at the full 3072 dims, so any
 * truncated dimensionality MUST be normalized client-side before it goes
 * near pgvector cosine distance.
 *
 * Returns `null` if GEMINI_API_KEY is unset — pipeline.ts and hybrid.ts both
 * handle that gracefully (ingest stores text without embeddings; retrieval
 * falls back to BM25-only), so a missing/expired key never hard-fails.
 */

const MODEL = "gemini-embedding-001";
const DIM = 768;
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`;
// Gemini caps batchEmbedContents at 100 requests per call.
const MAX_BATCH = 100;
// Max attempts per request before giving up (covers transient 429/5xx).
const MAX_RETRIES = 5;

/**
 * Gemini task types. Documents are embedded as RETRIEVAL_DOCUMENT; search
 * queries should be embedded as RETRIEVAL_QUERY for best asymmetric recall.
 */
export type EmbedTaskType =
  | "RETRIEVAL_DOCUMENT"
  | "RETRIEVAL_QUERY"
  | "SEMANTIC_SIMILARITY";

export type EmbedResult = {
  embeddings: number[][];
  model: string;
  dim: number;
};

function geminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

/** True when an embedding provider key is configured. */
export function embeddingsEnabled(): boolean {
  return !!geminiKey();
}

function l2normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}

async function embedChunk(
  key: string,
  texts: string[],
  taskType: EmbedTaskType,
): Promise<number[][]> {
  const body = JSON.stringify({
    requests: texts.map((text) => ({
      model: `models/${MODEL}`,
      content: { parts: [{ text }] },
      outputDimensionality: DIM,
      taskType,
    })),
  });

  // Retry on transient throttling (429) and server errors (5xx) with
  // exponential backoff. Gemini's free tier is rate-limited, so without this a
  // single burst (ingest, backfill, or a busy generation run) fails hard. A
  // persistent 429 after all retries usually means the daily quota is spent.
  let lastDetail = "";
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (res.ok) {
      const data = (await res.json()) as { embeddings?: Array<{ values: number[] }> };
      const out = data.embeddings ?? [];
      return out.map((e) => l2normalize(e.values));
    }

    lastDetail = await res.text().catch(() => `${res.status}`);
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === MAX_RETRIES - 1) {
      throw new Error(`Gemini embeddings failed (${res.status}): ${lastDetail.slice(0, 300)}`);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(30_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  throw new Error(`Gemini embeddings failed after ${MAX_RETRIES} attempts: ${lastDetail.slice(0, 300)}`);
}

/**
 * Embed a batch of texts. Returns null when no key is configured so callers
 * can degrade gracefully.
 *
 * @param texts    inputs to embed
 * @param taskType retrieval intent — defaults to RETRIEVAL_DOCUMENT (ingest);
 *                 pass RETRIEVAL_QUERY when embedding a search query.
 */
export async function embedBatch(
  texts: string[],
  taskType: EmbedTaskType = "RETRIEVAL_DOCUMENT",
): Promise<EmbedResult | null> {
  const key = geminiKey();
  if (!key) return null;
  if (texts.length === 0) return { embeddings: [], model: MODEL, dim: DIM };

  const embeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const slice = texts.slice(i, i + MAX_BATCH);
    const part = await embedChunk(key, slice, taskType);
    embeddings.push(...part);
  }

  return { embeddings, model: MODEL, dim: DIM };
}
