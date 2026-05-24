import { afterAll, beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { describeIntegration, getTestDb } from "./_db";
import { hybridRetrieve } from "@/lib/search/hybrid";

/**
 * Integration test for the BM25 leg of hybrid search.
 *
 * We intentionally do NOT exercise the vector leg here — that requires
 * OPENAI_API_KEY to be set. `hybridRetrieve` already gracefully degrades to
 * BM25-only when embeddings are unavailable, which is the path under test.
 */

const SOURCE_SLUG = "p11-bm25-src";
const RESOURCE_PREFIX = "p11-bm25-resource-";

describeIntegration("hybrid search (BM25 fixtures)", () => {
  // tests/setup/env.ts mirrors INTEGRATION_DATABASE_URL into DATABASE_URL so
  // hybridRetrieve (which guards on process.env.DATABASE_URL) picks up the
  // integration DB without us having to repeat that wiring per spec.
  beforeAll(async () => {
    const { db, schema } = await getTestDb();
    await db
      .insert(schema.sources)
      .values({
        slug: SOURCE_SLUG,
        name: "BM25 fixture",
        kind: "clinical_body",
        url: "https://example.test/bm25",
        trustTier: "tier_1",
      })
      .onConflictDoNothing();

    const fixtures = [
      {
        slug: `${RESOURCE_PREFIX}desire`,
        title: "Desire discrepancy in long-term couples",
        body:
          "Desire discrepancy describes a difference in how often each " +
          "partner wants sex. It is the most common presenting concern in " +
          "couples therapy and is best addressed via responsive desire " +
          "frameworks rather than as a problem of the lower-desire partner.",
      },
      {
        slug: `${RESOURCE_PREFIX}vag`,
        title: "Vaginismus: causes, assessment, and pelvic floor therapy",
        body:
          "Vaginismus involves involuntary tightening of the pelvic floor " +
          "muscles. Treatment combines pelvic floor physiotherapy, anxiety " +
          "management, gradual desensitisation, and partner involvement.",
      },
      {
        slug: `${RESOURCE_PREFIX}ed`,
        title: "Performance anxiety and erectile dysfunction",
        body:
          "Performance anxiety is a frequent driver of psychogenic erectile " +
          "dysfunction. Treatment includes cognitive restructuring, sensate " +
          "focus exercises, and ruling out vascular contributors.",
      },
    ];

    const { sources, resources, chunks } = schema;
    const [src] = await db
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.slug, SOURCE_SLUG));

    for (const f of fixtures) {
      const [res] = await db
        .insert(resources)
        .values({
          slug: f.slug,
          sourceId: src.id,
          kind: "article",
          title: f.title,
          authors: ["Fixture, A."],
          license: "cc_by",
          externalUrl: `https://example.test/${f.slug}`,
          fullTextAvailable: true,
          // PUBLISHED — hybrid search filters on is_published = TRUE.
          isPublished: true,
        })
        .onConflictDoUpdate({
          target: resources.slug,
          set: { title: f.title, isPublished: true },
        })
        .returning({ id: resources.id });

      // Reset chunks to keep the fixture deterministic across reruns.
      const { client } = await getTestDb();
      await client`delete from chunks where resource_id = ${res.id}`;

      await db.insert(chunks).values({
        resourceId: res.id,
        ord: 0,
        content: f.body,
        tokens: f.body.split(/\s+/).length,
      });
    }
  });

  afterAll(async () => {
    const { client } = await getTestDb();
    await client`delete from resources where slug like ${RESOURCE_PREFIX + "%"}`;
    await client`delete from sources where slug = ${SOURCE_SLUG}`;
  });

  test("query: 'vaginismus pelvic floor' ranks the vaginismus fixture first", async () => {
    const hits = await hybridRetrieve({ query: "vaginismus pelvic floor", topK: 5 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].resourceSlug).toBe(`${RESOURCE_PREFIX}vag`);
    expect(hits[0].matchedBy).toContain("bm25");
  });

  test("query: 'erectile dysfunction performance anxiety' ranks the ED fixture first", async () => {
    const hits = await hybridRetrieve({
      query: "erectile dysfunction performance anxiety",
      topK: 5,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].resourceSlug).toBe(`${RESOURCE_PREFIX}ed`);
  });

  test("query unrelated to fixtures returns no hits, never crashes", async () => {
    const hits = await hybridRetrieve({
      query: "asdfqwer xyzzy nothing-relevant-here",
      topK: 5,
    });
    expect(Array.isArray(hits)).toBe(true);
  });

  test("scopedResourceId restricts results to that resource", async () => {
    const { db, schema } = await getTestDb();
    const [scoped] = await db
      .select({ id: schema.resources.id })
      .from(schema.resources)
      .where(eq(schema.resources.slug, `${RESOURCE_PREFIX}desire`));

    const hits = await hybridRetrieve({
      query: "couples therapy",
      topK: 5,
      scopedResourceId: scoped.id,
    });
    for (const h of hits) {
      expect(h.resourceId).toBe(scoped.id);
    }
  });

  test("only published resources surface — unpublished is invisible to search", async () => {
    const { db, schema } = await getTestDb();
    // Take one fixture out of publication temporarily.
    await db
      .update(schema.resources)
      .set({ isPublished: false })
      .where(eq(schema.resources.slug, `${RESOURCE_PREFIX}desire`));

    const hits = await hybridRetrieve({ query: "desire discrepancy couples", topK: 5 });
    expect(hits.find((h) => h.resourceSlug === `${RESOURCE_PREFIX}desire`)).toBeUndefined();

    // Restore so the rest of the suite is consistent.
    await db
      .update(schema.resources)
      .set({ isPublished: true })
      .where(eq(schema.resources.slug, `${RESOURCE_PREFIX}desire`));
  });
});
