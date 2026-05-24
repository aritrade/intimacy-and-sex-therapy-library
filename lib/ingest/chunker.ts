/**
 * Semantic chunker. Splits long-form text into ~700-token chunks with a
 * 100-token overlap, preserving sentence boundaries when possible. We use
 * a 4-chars-per-token estimate, which is good enough for chunk sizing —
 * actual token counts come back from the embedding API.
 *
 * Each chunk carries optional `pageNum` (for PDFs) or `timestampSeconds`
 * (for video transcripts) so citations can deep-link back to the source.
 */

const CHARS_PER_TOKEN = 4;
const TARGET_TOKENS = 700;
const OVERLAP_TOKENS = 100;
const TARGET_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN;

export type ChunkInput = {
  text: string;
  pageMarkers?: Array<{ offset: number; pageNum: number }>;
  timestampMarkers?: Array<{ offset: number; seconds: number }>;
};

export type Chunk = {
  ord: number;
  content: string;
  approxTokens: number;
  pageNum?: number;
  timestampSeconds?: number;
};

export function chunkText({ text, pageMarkers, timestampMarkers }: ChunkInput): Chunk[] {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];

  const chunks: Chunk[] = [];
  let cursor = 0;
  let ord = 0;

  while (cursor < clean.length) {
    let end = Math.min(cursor + TARGET_CHARS, clean.length);

    if (end < clean.length) {
      const slice = clean.slice(cursor, end);
      const lastBreak = Math.max(
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf(". "),
        slice.lastIndexOf("! "),
        slice.lastIndexOf("? "),
      );
      if (lastBreak > TARGET_CHARS / 2) {
        end = cursor + lastBreak + 1;
      }
    }

    const content = clean.slice(cursor, end).trim();
    if (content) {
      const approxTokens = Math.ceil(content.length / CHARS_PER_TOKEN);
      chunks.push({
        ord,
        content,
        approxTokens,
        pageNum: pageMarkers ? findMarker(pageMarkers, cursor) : undefined,
        timestampSeconds: timestampMarkers
          ? findMarker(timestampMarkers, cursor)
          : undefined,
      });
      ord += 1;
    }

    if (end >= clean.length) break;
    cursor = Math.max(end - OVERLAP_CHARS, cursor + 1);
  }

  return chunks;
}

function findMarker<T extends { offset: number }, K extends keyof T>(
  markers: T[],
  offset: number,
): T[K] | undefined {
  let last: T | undefined;
  for (const m of markers) {
    if (m.offset <= offset) last = m;
    else break;
  }
  if (!last) return undefined;
  const keys = Object.keys(last).filter((k) => k !== "offset");
  return last[keys[0] as K];
}
