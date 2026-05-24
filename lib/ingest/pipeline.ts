/**
 * Generic ingestion pipeline: fetch -> license-gate -> chunk -> embed -> tag -> upsert.
 *
 * Source modules (lib/ingest/sources/*.ts) produce a list of resource
 * descriptors plus a way to fetch full text. This file orchestrates the rest.
 *
 * Outputs are written into Postgres with `is_published=false`. A curator must
 * approve via the admin UI before anything is shown publicly.
 */

import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { chunks, resourceTags, resources, sources, tags } from "../db/schema";
import { embedBatch } from "../ai/embeddings";
import { canStoreFullText, type License } from "./license-gate";
import { chunkText } from "./chunker";
import { tagResource, type TaggerOutput } from "./tagger";
import { slugify } from "../utils";

export type IngestRecord = {
  sourceSlug: string; // must match an entry in sources table
  title: string;
  authors: string[];
  authorCredentials?: string[];
  publishedAt?: Date;
  language?: string;
  license: License;
  externalUrl: string;
  pdfBlobUrl?: string | null;
  abstract?: string;
  body?: string; // full text — only used if license permits
  kind: "article" | "video" | "podcast_episode" | "book" | "guideline" | "worksheet";
};

export type IngestSummary = {
  upserted: number;
  skipped: { reason: string; title: string }[];
  embeddingsRequested: boolean;
};

export async function ingestMany(records: IngestRecord[]): Promise<IngestSummary> {
  const summary: IngestSummary = {
    upserted: 0,
    skipped: [],
    embeddingsRequested: !!process.env.OPENAI_API_KEY,
  };

  for (const r of records) {
    try {
      await ingestOne(r);
      summary.upserted += 1;
    } catch (err) {
      summary.skipped.push({
        reason: err instanceof Error ? err.message : String(err),
        title: r.title,
      });
    }
  }
  return summary;
}

async function ingestOne(r: IngestRecord) {
  const src = await db.query.sources.findFirst({
    where: eq(sources.slug, r.sourceSlug),
  });
  if (!src) throw new Error(`Source not allowlisted: ${r.sourceSlug}`);

  const slug = slugify(r.title).slice(0, 180);
  const fullTextOk = canStoreFullText(r.license);
  const bodyForRag = fullTextOk ? r.body ?? "" : "";

  const [resource] = await db
    .insert(resources)
    .values({
      slug,
      sourceId: src.id,
      kind: r.kind,
      title: r.title,
      authors: r.authors,
      authorCredentials: r.authorCredentials ?? [],
      publishedAt: r.publishedAt ?? null,
      language: r.language ?? "en",
      license: r.license,
      fullTextAvailable: fullTextOk,
      externalUrl: r.externalUrl,
      pdfBlobUrl: r.pdfBlobUrl ?? null,
      summary: r.abstract ?? null,
      curatorNotes: null,
      isPublished: false,
    })
    .onConflictDoUpdate({
      target: resources.slug,
      set: {
        sourceId: src.id,
        title: r.title,
        authors: r.authors,
        authorCredentials: r.authorCredentials ?? [],
        publishedAt: r.publishedAt ?? null,
        license: r.license,
        externalUrl: r.externalUrl,
        summary: r.abstract ?? null,
        fullTextAvailable: fullTextOk,
        updatedAt: new Date(),
      },
    })
    .returning({ id: resources.id });

  // Auto-tag (difficulty + topic + population + modality), still needs human review.
  const tagged = await tagResource({
    title: r.title,
    abstract: r.abstract,
    body: bodyForRag.slice(0, 12_000),
  });
  await applyTags(resource.id, tagged);

  // Chunk + embed only if we're allowed to store full text.
  if (fullTextOk && bodyForRag.length > 0) {
    const ch = chunkText({ text: bodyForRag });
    const embed = ch.length > 0 ? await embedBatch(ch.map((c) => c.content)) : null;

    for (let i = 0; i < ch.length; i++) {
      await db.insert(chunks).values({
        resourceId: resource.id,
        ord: ch[i].ord,
        content: ch[i].content,
        tokens: ch[i].approxTokens,
        pageNum: ch[i].pageNum ?? null,
        timestampSeconds: ch[i].timestampSeconds ?? null,
        embedding: embed ? embed.embeddings[i] : undefined,
      });
    }
  }
}

async function applyTags(resourceId: string, t: TaggerOutput) {
  const wanted = [
    { name: t.difficulty, category: "difficulty" as const },
    ...t.topics.map((n) => ({ name: n, category: "topic" as const })),
    ...t.populations.map((n) => ({ name: n, category: "population" as const })),
    ...t.modalities.map((n) => ({ name: n, category: "modality" as const })),
  ];
  for (const w of wanted) {
    const found = await db.query.tags.findFirst({
      where: (table, { and, eq: e }) => and(e(table.name, w.name), e(table.category, w.category)),
    });
    if (!found) continue; // tag not seeded; skip
    await db.insert(resourceTags).values({ resourceId, tagId: found.id }).onConflictDoNothing();
  }
}
