import { afterEach, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import { describeIntegration, getTestDb } from "./_db";

describeIntegration("role mutations + reviewer notes (DB-level)", () => {
  afterEach(async () => {
    const { client } = await getTestDb();
    // Tests below use unique emails / titles, but we still tidy up to keep
    // the suite self-contained.
    await client`delete from user_roles where user_id in (select id from users where email like 'p13-%')`;
    await client`delete from users where email like 'p13-%'`;
    await client`delete from content_drafts where brief like 'p13-%'`;
  });

  test("user_roles is a composite PK — duplicate inserts are no-ops", async () => {
    const { db, client, schema } = await getTestDb();
    const [u] = await db
      .insert(schema.users)
      .values({ email: "p13-dup@example.com", name: "Dup" })
      .returning();
    await db
      .insert(schema.userRoles)
      .values({ userId: u.id, role: "clinician" })
      .onConflictDoNothing();
    await db
      .insert(schema.userRoles)
      .values({ userId: u.id, role: "clinician" })
      .onConflictDoNothing();
    const rows = (await client`select count(*)::int as n from user_roles where user_id = ${u.id}`) as Array<{
      n: number;
    }>;
    expect(rows[0].n).toBe(1);
  });

  test("ON DELETE CASCADE removes role rows when a user is deleted", async () => {
    const { db, client, schema } = await getTestDb();
    const [u] = await db
      .insert(schema.users)
      .values({ email: "p13-cascade@example.com", name: "Cascade" })
      .returning();
    await db.insert(schema.userRoles).values([
      { userId: u.id, role: "clinician" },
      { userId: u.id, role: "editor" },
    ]);
    await db.delete(schema.users).where(eq(schema.users.id, u.id));
    const rows = (await client`select count(*)::int as n from user_roles where user_id = ${u.id}`) as Array<{
      n: number;
    }>;
    expect(rows[0].n).toBe(0);
  });

  test("reviewer_notes appends as a jsonb array (concat operator)", async () => {
    const { db, client, schema } = await getTestDb();

    const [d] = await db
      .insert(schema.contentDrafts)
      .values({
        kind: "reel",
        language: "en",
        brief: "p13-notes-append-fixture",
        scriptMd: "# Hook\nhi\n",
        status: "script_draft",
      })
      .returning();

    const noteA = {
      reason: "needs_citation",
      notes: "please cite a peer-reviewed source",
      by: "abc1234567890def",
      role: "clinician",
      ts: new Date().toISOString(),
    };
    const noteB = {
      reason: "tone_off",
      notes: "second pass",
      by: "abc1234567890def",
      role: "editor",
      ts: new Date(Date.now() + 1000).toISOString(),
    };

    await db
      .update(schema.contentDrafts)
      .set({
        reviewerNotes: sql`coalesce(${schema.contentDrafts.reviewerNotes}, '[]'::jsonb) || ${JSON.stringify(
          [noteA],
        )}::jsonb`,
      })
      .where(eq(schema.contentDrafts.id, d.id));
    await db
      .update(schema.contentDrafts)
      .set({
        reviewerNotes: sql`coalesce(${schema.contentDrafts.reviewerNotes}, '[]'::jsonb) || ${JSON.stringify(
          [noteB],
        )}::jsonb`,
      })
      .where(eq(schema.contentDrafts.id, d.id));

    const rows = (await client`select reviewer_notes from content_drafts where id = ${d.id}`) as Array<{
      reviewer_notes: unknown[];
    }>;
    const notes = rows[0].reviewer_notes as Array<Record<string, string>>;
    expect(notes.length).toBe(2);
    expect(notes[0].reason).toBe("needs_citation");
    expect(notes[1].reason).toBe("tone_off");
    expect(notes[1].role).toBe("editor");
  });
});
