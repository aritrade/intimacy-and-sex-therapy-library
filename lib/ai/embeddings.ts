/**
 * Embeddings via OpenAI text-embedding-3-small (1536 dim).
 *
 * Returns `null` if OPENAI_API_KEY is unset — pipeline.ts handles that
 * gracefully so a curator can still ingest text without embeddings, then
 * re-run an "embed missing" job once the key is configured.
 */

const MODEL = "text-embedding-3-small";
const DIM = 1536;

export type EmbedResult = {
  embeddings: number[][];
  model: string;
  dim: number;
};

export async function embedBatch(texts: string[]): Promise<EmbedResult | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  if (texts.length === 0) return { embeddings: [], model: MODEL, dim: DIM };

  const { embedMany } = await import("ai");
  const { openai } = await import("@ai-sdk/openai");

  const { embeddings } = await embedMany({
    model: openai.embedding(MODEL),
    values: texts,
  });
  return { embeddings, model: MODEL, dim: DIM };
}
