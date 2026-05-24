import { expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { describeIntegration, getTestDb } from "./_db";

describeIntegration("migrations + extensions", () => {
  test("vector + pg_trgm extensions are installed", async () => {
    const { client } = await getTestDb();
    const rows = (await client`
      select extname from pg_extension
       where extname in ('vector','pg_trgm')
       order by extname
    `) as Array<{ extname: string }>;
    expect(rows.map((r) => r.extname)).toEqual(["pg_trgm", "vector"]);
  });

  test("the chunks table has both an HNSW vector index and a GIN tsv index", async () => {
    const { client } = await getTestDb();
    const idx = (await client`
      select indexname, indexdef
        from pg_indexes
       where tablename = 'chunks'
    `) as Array<{ indexname: string; indexdef: string }>;
    const names = idx.map((r) => r.indexname);
    expect(names).toContain("chunks_embedding_hnsw_idx");
    expect(names).toContain("chunks_tsv_gin_idx");
    expect(idx.find((r) => r.indexname === "chunks_embedding_hnsw_idx")?.indexdef).toMatch(
      /USING\s+hnsw/i,
    );
    expect(idx.find((r) => r.indexname === "chunks_tsv_gin_idx")?.indexdef).toMatch(
      /USING\s+gin/i,
    );
  });

  test("the tsv trigger keeps tsvector in sync on insert", async () => {
    const { client, db, schema } = await getTestDb();

    // Create a placeholder source + resource so chunks has a parent.
    await db
      .insert(schema.sources)
      .values({
        slug: "mig-test-src",
        name: "Migration Test Source",
        kind: "clinical_body",
        url: "https://example.test/mig",
        trustTier: "tier_1",
      })
      .onConflictDoNothing();
    const [src] = (await client`
      select id from sources where slug = 'mig-test-src'
    `) as Array<{ id: string }>;
    const [res] = await db
      .insert(schema.resources)
      .values({
        slug: `mig-test-resource-${Date.now()}`,
        sourceId: src.id,
        kind: "article",
        title: "Migration test",
        authors: ["Q. A."],
        license: "cc_by",
        externalUrl: "https://example.test/mig",
        fullTextAvailable: true,
        isPublished: false,
      })
      .returning({ id: schema.resources.id });

    const [chunk] = await db
      .insert(schema.chunks)
      .values({
        resourceId: res.id,
        ord: 0,
        content: "couples therapy improves intimacy and reduces conflict",
        tokens: 8,
      })
      .returning({ id: schema.chunks.id });

    const rows = (await client`
      select tsv::text as tsv from chunks where id = ${chunk.id}
    `) as Array<{ tsv: string | null }>;
    expect(rows[0].tsv).toBeTruthy();
    expect(rows[0].tsv).toContain("couples");
    expect(rows[0].tsv).toContain("intimaci"); // english stemmer collapses 'intimacy'

    // Cleanup so the suite doesn't pollute later searches.
    await client`delete from resources where id = ${res.id}`;
    await db.execute(sql`delete from sources where slug = 'mig-test-src'`);
  });

  test("all expected business tables exist", async () => {
    const { client } = await getTestDb();
    const rows = (await client`
      select table_name from information_schema.tables
       where table_schema = 'public'
    `) as Array<{ table_name: string }>;
    const names = new Set(rows.map((r) => r.table_name));
    for (const t of [
      "sources",
      "resources",
      "chunks",
      "tags",
      "resource_tags",
      "users",
      "accounts",
      "sessions",
      "user_roles",
      "assessment_results",
      "user_path_progress",
      "vault_entries",
      "clinical_advisors",
    ]) {
      expect(names.has(t), `expected table ${t} to exist`).toBe(true);
    }
  });
});
