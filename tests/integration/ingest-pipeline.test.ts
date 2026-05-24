import { afterEach, beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { describeIntegration, getTestDb } from "./_db";
import { ingestMany, type IngestRecord } from "@/lib/ingest/pipeline";
import { ALLOWLIST } from "@/lib/ingest/allowlist";

const TEST_SOURCE_SLUG = "pmc-oa";

describeIntegration("ingestion pipeline (license gate)", () => {
  beforeAll(async () => {
    // Make sure the allowlist is seeded — the pipeline rejects any record
    // whose sourceSlug is not present in the sources table.
    const { db, schema } = await getTestDb();
    for (const src of ALLOWLIST) {
      await db
        .insert(schema.sources)
        .values({
          slug: src.slug,
          name: src.name,
          kind: src.kind,
          url: src.url,
          trustTier: src.trustTier,
          notes: src.notes ?? null,
        })
        .onConflictDoNothing();
    }
  });

  // Each test owns its own resource slugs and cleans up so reruns are stable.
  afterEach(async () => {
    const { client } = await getTestDb();
    await client`delete from resources where slug like 'p11-test-%'`;
  });

  test("CC-BY full-text resource creates a resource AND chunks", async () => {
    const rec: IngestRecord = {
      sourceSlug: TEST_SOURCE_SLUG,
      kind: "article",
      title: "p11 test open access — couples desire discrepancy",
      authors: ["Doe, J.", "Roe, R."],
      authorCredentials: ["PhD", "MD"],
      license: "cc_by",
      externalUrl: "https://example.test/p11/cc-by",
      abstract: "An open-access study of desire discrepancy in couples therapy.",
      body:
        "Desire discrepancy is one of the most common presenting concerns in " +
        "couples therapy. Clinicians use behavioural activation, scheduling " +
        "intimacy, and addressing resentment. Communication training and " +
        "responsive desire models reduce the pressure on the lower-desire " +
        "partner and reframe the issue as a shared one rather than a deficit.",
    };

    const out = await ingestMany([rec]);
    expect(out.upserted).toBe(1);
    expect(out.skipped).toEqual([]);

    const { db, schema } = await getTestDb();
    const [resource] = await db
      .select()
      .from(schema.resources)
      .where(eq(schema.resources.externalUrl, rec.externalUrl));
    expect(resource).toBeTruthy();
    expect(resource.fullTextAvailable).toBe(true);
    expect(resource.isPublished).toBe(false); // human review required

    const chunks = await db
      .select()
      .from(schema.chunks)
      .where(eq(schema.chunks.resourceId, resource.id));
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].content.length).toBeGreaterThan(0);
  });

  test("copyrighted resource stores metadata only — never chunks", async () => {
    const rec: IngestRecord = {
      sourceSlug: TEST_SOURCE_SLUG,
      kind: "book",
      title: "p11 test copyrighted — closed-access book",
      authors: ["Author, X."],
      license: "copyrighted",
      externalUrl: "https://example.test/p11/copyrighted",
      abstract: "A summary curators can show; full text is NOT stored.",
      body:
        "This text body is provided to the pipeline but the license gate must " +
        "refuse to chunk it. Verifying this is the whole point of the test.",
    };

    const out = await ingestMany([rec]);
    expect(out.upserted).toBe(1);

    const { db, schema } = await getTestDb();
    const [resource] = await db
      .select()
      .from(schema.resources)
      .where(eq(schema.resources.externalUrl, rec.externalUrl));
    expect(resource.fullTextAvailable).toBe(false);

    const chunks = await db
      .select()
      .from(schema.chunks)
      .where(eq(schema.chunks.resourceId, resource.id));
    expect(chunks.length).toBe(0);

    // The summary / abstract are still kept — that's the whole hybrid model.
    expect(resource.summary).toBeTruthy();
  });

  test("non-allowlisted source is rejected, not silently accepted", async () => {
    const rec: IngestRecord = {
      sourceSlug: "this-slug-does-not-exist-anywhere",
      kind: "article",
      title: "p11 test not-allowlisted",
      authors: ["A."],
      license: "cc_by",
      externalUrl: "https://example.test/p11/blocked",
    };

    const out = await ingestMany([rec]);
    expect(out.upserted).toBe(0);
    expect(out.skipped.length).toBe(1);
    expect(out.skipped[0].reason.toLowerCase()).toContain("not allowlisted");
  });
});
