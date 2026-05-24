/**
 * Read-side queries used by app routes. Kept out of route files so the
 * shape is stable and route handlers can stay focused on rendering.
 *
 * Every function here gracefully handles "no DB configured" by returning
 * an empty result, so the public site renders even before DATABASE_URL is set.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./client";
import {
  chunks,
  clinicianDirectory,
  clinicalAdvisors,
  resources,
  resourceTags,
  reviews,
  sources,
  tags,
} from "./schema";

export type CatalogFilters = {
  topic?: string;
  difficulty?: string;
  kind?: string;
  population?: string;
  modality?: string;
  language?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export type CatalogItem = {
  id: string;
  slug: string;
  title: string;
  authors: string[];
  language: string;
  kind: string;
  externalUrl: string;
  pdfBlobUrl: string | null;
  summary: string | null;
  source: { slug: string; name: string; tier: string };
  tagNames: string[];
};

export async function listCatalog(filters: CatalogFilters = {}): Promise<CatalogItem[]> {
  if (!process.env.DATABASE_URL) return [];

  const where = [eq(resources.isPublished, true)];
  if (filters.kind) where.push(eq(resources.kind, filters.kind as never));
  if (filters.language) where.push(eq(resources.language, filters.language));
  if (filters.q) where.push(sql`${resources.title} ILIKE ${"%" + filters.q + "%"}`);

  const tagFilters = [
    filters.topic ? { name: filters.topic, category: "topic" as const } : null,
    filters.difficulty ? { name: filters.difficulty, category: "difficulty" as const } : null,
    filters.population ? { name: filters.population, category: "population" as const } : null,
    filters.modality ? { name: filters.modality, category: "modality" as const } : null,
  ].filter(Boolean) as Array<{ name: string; category: "topic" | "difficulty" | "population" | "modality" }>;

  let resourceIdSubset: string[] | null = null;
  if (tagFilters.length > 0) {
    const matchingTagIds: string[] = [];
    for (const tf of tagFilters) {
      const t = await db.query.tags.findFirst({
        where: (table, { and: a, eq: e }) => a(e(table.name, tf.name), e(table.category, tf.category)),
      });
      if (!t) return []; // unknown filter -> nothing
      matchingTagIds.push(t.id);
    }
    const rows = await db
      .select({ resourceId: resourceTags.resourceId })
      .from(resourceTags)
      .where(inArray(resourceTags.tagId, matchingTagIds));
    resourceIdSubset = rows.map((r) => r.resourceId);
    if (resourceIdSubset.length === 0) return [];
    where.push(inArray(resources.id, resourceIdSubset));
  }

  const rows = await db
    .select({
      id: resources.id,
      slug: resources.slug,
      title: resources.title,
      authors: resources.authors,
      language: resources.language,
      kind: resources.kind,
      externalUrl: resources.externalUrl,
      pdfBlobUrl: resources.pdfBlobUrl,
      summary: resources.summary,
      sourceSlug: sources.slug,
      sourceName: sources.name,
      sourceTier: sources.trustTier,
    })
    .from(resources)
    .innerJoin(sources, eq(resources.sourceId, sources.id))
    .where(and(...where))
    .orderBy(desc(resources.publishedAt))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const tagRows = await db
    .select({ resourceId: resourceTags.resourceId, name: tags.name })
    .from(resourceTags)
    .innerJoin(tags, eq(resourceTags.tagId, tags.id))
    .where(inArray(resourceTags.resourceId, ids));

  const tagsByResource = new Map<string, string[]>();
  for (const t of tagRows) {
    const arr = tagsByResource.get(t.resourceId) ?? [];
    arr.push(t.name);
    tagsByResource.set(t.resourceId, arr);
  }

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    authors: (r.authors as string[]) ?? [],
    language: r.language,
    kind: r.kind,
    externalUrl: r.externalUrl,
    pdfBlobUrl: r.pdfBlobUrl,
    summary: r.summary,
    source: { slug: r.sourceSlug, name: r.sourceName, tier: r.sourceTier },
    tagNames: tagsByResource.get(r.id) ?? [],
  }));
}

export type ResourceDetail = CatalogItem & {
  curatorNotes: string | null;
  authorCredentials: string[];
  publishedAt: Date | null;
  license: string;
  fullTextAvailable: boolean;
  latestReview?: { reviewerName: string; reviewerCredentials: string[]; reviewedAt: Date; nextReviewDue: Date };
};

export async function getResourceBySlug(slug: string): Promise<ResourceDetail | null> {
  if (!process.env.DATABASE_URL) return null;

  const row = await db
    .select({
      id: resources.id,
      slug: resources.slug,
      title: resources.title,
      authors: resources.authors,
      authorCredentials: resources.authorCredentials,
      publishedAt: resources.publishedAt,
      language: resources.language,
      kind: resources.kind,
      license: resources.license,
      fullTextAvailable: resources.fullTextAvailable,
      externalUrl: resources.externalUrl,
      pdfBlobUrl: resources.pdfBlobUrl,
      summary: resources.summary,
      curatorNotes: resources.curatorNotes,
      sourceSlug: sources.slug,
      sourceName: sources.name,
      sourceTier: sources.trustTier,
    })
    .from(resources)
    .innerJoin(sources, eq(resources.sourceId, sources.id))
    .where(eq(resources.slug, slug))
    .limit(1);

  if (row.length === 0) return null;
  const r = row[0];

  const tagRows = await db
    .select({ name: tags.name })
    .from(resourceTags)
    .innerJoin(tags, eq(resourceTags.tagId, tags.id))
    .where(eq(resourceTags.resourceId, r.id));

  const reviewRow = await db
    .select({
      reviewerName: clinicalAdvisors.name,
      reviewerCredentials: clinicalAdvisors.credentials,
      reviewedAt: reviews.reviewedAt,
      nextReviewDue: reviews.nextReviewDue,
    })
    .from(reviews)
    .innerJoin(clinicalAdvisors, eq(reviews.reviewerId, clinicalAdvisors.id))
    .where(eq(reviews.resourceId, r.id))
    .orderBy(desc(reviews.reviewedAt))
    .limit(1);

  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    authors: (r.authors as string[]) ?? [],
    authorCredentials: (r.authorCredentials as string[]) ?? [],
    publishedAt: r.publishedAt,
    language: r.language,
    kind: r.kind,
    license: r.license,
    fullTextAvailable: r.fullTextAvailable,
    externalUrl: r.externalUrl,
    pdfBlobUrl: r.pdfBlobUrl,
    summary: r.summary,
    curatorNotes: r.curatorNotes,
    source: { slug: r.sourceSlug, name: r.sourceName, tier: r.sourceTier },
    tagNames: tagRows.map((t) => t.name),
    latestReview:
      reviewRow.length > 0
        ? {
            reviewerName: reviewRow[0].reviewerName,
            reviewerCredentials: (reviewRow[0].reviewerCredentials as string[]) ?? [],
            reviewedAt: reviewRow[0].reviewedAt,
            nextReviewDue: reviewRow[0].nextReviewDue,
          }
        : undefined,
  };
}

export async function listLibraryPdfs(): Promise<CatalogItem[]> {
  if (!process.env.DATABASE_URL) return [];
  const all = await listCatalog({ limit: 200 });
  return all.filter((r) => r.pdfBlobUrl);
}

/**
 * Featured videos for the homepage shelf. Returns published video resources
 * sorted by published date (desc) up to `limit`. Each item is shaped exactly
 * like a CatalogItem so the same ResourceCard can render it.
 */
export async function listFeaturedVideos(limit = 6): Promise<CatalogItem[]> {
  if (!process.env.DATABASE_URL) return [];
  return listCatalog({ kind: "video", limit });
}

/**
 * Library items = anything document-shaped:
 *   - kind in (book, report, guideline, worksheet), OR
 *   - has a hosted PDF in our blob (kind=article PDFs from PMC, etc.)
 *
 * The Virtual Library page renders open-access PDFs inline and uses
 * authorized deep-links (publisher / Google Books / Open Library / WorldCat)
 * for copyrighted books. Listed here so callers don't have to know that
 * distinction up-front.
 */
export async function listLibraryItems(): Promise<CatalogItem[]> {
  if (!process.env.DATABASE_URL) return [];
  const all = await listCatalog({ limit: 200 });
  return all.filter(
    (r) =>
      ["book", "report", "guideline", "worksheet"].includes(r.kind) || !!r.pdfBlobUrl
  );
}

/**
 * Aggregate published-resource counts per tag, scoped to a category.
 * Used by the catalog filters to badge each chip with how many resources
 * are actually available, and by the empty-state to distinguish
 * "DB has no resources" from "no match for this filter".
 */
export async function countResourcesByTag(
  category: "topic" | "difficulty" | "population" | "modality"
): Promise<{ totalPublished: number; counts: Record<string, number> }> {
  if (!process.env.DATABASE_URL) return { totalPublished: 0, counts: {} };

  const totalRow = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(resources)
    .where(eq(resources.isPublished, true));
  const totalPublished = totalRow[0]?.n ?? 0;

  const rows = await db
    .select({ name: tags.name, n: sql<number>`count(*)::int` })
    .from(resourceTags)
    .innerJoin(tags, eq(resourceTags.tagId, tags.id))
    .innerJoin(resources, eq(resourceTags.resourceId, resources.id))
    .where(and(eq(tags.category, category), eq(resources.isPublished, true)))
    .groupBy(tags.name);

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.name] = r.n;
  return { totalPublished, counts };
}

export async function listClinicians(country = "IN") {
  if (!process.env.DATABASE_URL) return [];
  return db.query.clinicianDirectory.findMany({
    where: eq(clinicianDirectory.country, country),
    limit: 50,
  });
}

export async function searchChunksByText(q: string, limit = 8) {
  if (!process.env.DATABASE_URL) return [];
  return db
    .select({
      content: chunks.content,
      resourceId: chunks.resourceId,
      pageNum: chunks.pageNum,
    })
    .from(chunks)
    .where(sql`${chunks.tsv} @@ websearch_to_tsquery('english', ${q})`)
    .limit(limit);
}
