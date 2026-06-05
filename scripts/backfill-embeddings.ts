/**
 * Backfill embeddings for chunks that have none (CLI).
 *
 *   npm run backfill:embeddings              # embed all chunks where embedding IS NULL
 *   npm run backfill:embeddings -- --limit=100
 *
 * Idempotent and safe to re-run: only touches rows with a NULL embedding, so
 * already-embedded chunks are skipped. Uses the same Gemini model + task type
 * (RETRIEVAL_DOCUMENT) as ingest, so backfilled vectors are consistent with
 * freshly-ingested ones. Requires GEMINI_API_KEY.
 */

import "dotenv/config";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { chunks } from "../lib/db/schema";
import { embedBatch, embeddingsEnabled } from "../lib/ai/embeddings";

function flag(name: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const v = Number(arg.split("=")[1]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

// Small batches + a pause between them keep us under the free-tier per-minute
// token/RPM limit. embedChunk() also retries 429s with backoff as a safety net.
const BATCH = 16;
const PAUSE_MS = 4000;
// On a per-minute throttle, wait a full window before retrying the batch.
const COOLDOWN_MS = 65_000;
const BATCH_RETRIES = 6;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(2);
  }
  if (!embeddingsEnabled()) {
    console.error("GEMINI_API_KEY is not set — cannot embed.");
    process.exit(2);
  }

  const limit = flag("limit", 100000);
  const pending = (await db.execute(sql`
    select id, content from chunks where embedding is null limit ${limit}
  `)) as unknown as Array<{ id: string; content: string }>;

  console.log(`Found ${pending.length} chunk(s) needing embeddings.`);
  if (pending.length === 0) {
    process.exit(0);
  }

  let done = 0;
  let failed = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    const slice = pending.slice(i, i + BATCH);

    // The free tier limits tokens-per-minute; when we saturate it, cool down a
    // full window and retry the same batch. Progress is committed per-row, so
    // even if we give up the work so far is durable and a re-run resumes.
    let res = null as Awaited<ReturnType<typeof embedBatch>>;
    for (let attempt = 0; attempt < BATCH_RETRIES; attempt++) {
      try {
        res = await embedBatch(slice.map((c) => c.content));
        break;
      } catch (e) {
        const msg = String((e as Error).message);
        if (attempt === BATCH_RETRIES - 1) {
          console.error(`Giving up on batch at offset ${i}: ${msg.slice(0, 120)}`);
        } else {
          console.log(`  rate-limited at ${i}/${pending.length} — cooling down ${COOLDOWN_MS / 1000}s…`);
          await sleep(COOLDOWN_MS);
        }
      }
    }
    if (!res) {
      console.error(`Stopping with ${done} embedded so far; re-run to resume the rest.`);
      break;
    }

    for (let j = 0; j < slice.length; j++) {
      const vec = res.embeddings[j];
      if (!vec || vec.length === 0) {
        failed += 1;
        continue;
      }
      await db.update(chunks).set({ embedding: vec }).where(eq(chunks.id, slice[j].id));
      done += 1;
    }
    console.log(`  embedded ${Math.min(i + BATCH, pending.length)}/${pending.length}…`);
    if (i + BATCH < pending.length) await sleep(PAUSE_MS);
  }

  console.log(JSON.stringify({ embedded: done, failed }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
