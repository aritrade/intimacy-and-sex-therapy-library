import { afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { describeIntegration, getTestDb } from "./_db";

/**
 * The DELETE /api/account/forget handler runs an explicit transaction that
 * deletes child rows (assessment_results, user_path_progress, vault_entries,
 * user_roles, sessions, accounts) before the user. We mirror that exact
 * sequence here so the test verifies the deletion contract end-to-end —
 * including the ON DELETE CASCADE foreign keys we rely on as a safety net.
 *
 * If a future refactor adds another per-user table, this test should fail
 * (because the user row deletion will then break a FK), prompting the
 * author to update both the handler and the schema cascade rules.
 */

describeIntegration("right-to-erasure cascade", () => {
  afterEach(async () => {
    const { client } = await getTestDb();
    await client`delete from users where email like 'forget-me-%@example.test'`;
  });

  test("hard-delete removes user + every dependent row in one transaction", async () => {
    const { db, schema, client } = await getTestDb();
    const email = `forget-me-${Date.now()}@example.test`;

    // ---- arrange: insert a user with rows in every per-user table ----
    const [user] = await db
      .insert(schema.users)
      .values({ email, name: "Forget Me", region: "IN" })
      .returning({ id: schema.users.id });

    await db.insert(schema.assessmentResults).values({
      userId: user.id,
      instrumentId: "phq9",
      rawScore: 7,
      severity: "mild",
      flags: [],
    });

    await db.insert(schema.userPathProgress).values({
      userId: user.id,
      pathSlug: "couples-reset",
      stepIndex: 0,
    });

    await db.insert(schema.vaultEntries).values({
      userId: user.id,
      label: "test entry",
      ciphertext: "AAAA",
      iv: "AAAAAAAAAAAAAAAA",
      salt: "BBBBBBBBBBBBBBBB",
      kdfIterations: 310_000,
    });

    await db.insert(schema.userRoles).values({
      userId: user.id,
      role: "user",
    });

    await db.insert(schema.sessions).values({
      sessionToken: `tok-${Date.now()}`,
      userId: user.id,
      expires: new Date(Date.now() + 1000 * 60 * 60),
    });

    await db.insert(schema.accounts).values({
      userId: user.id,
      type: "oauth",
      provider: "google",
      providerAccountId: `google-${Date.now()}`,
    });

    // sanity: every child row is in place
    const childCounts = async () => ({
      assessment: await rowCount(client, "assessment_results", "user_id", user.id),
      path: await rowCount(client, "user_path_progress", "user_id", user.id),
      vault: await rowCount(client, "vault_entries", "user_id", user.id),
      roles: await rowCount(client, "user_roles", "user_id", user.id),
      sessions: await rowCount(client, "sessions", "userId", user.id),
      accounts: await rowCount(client, "accounts", "userId", user.id),
    });
    expect(await childCounts()).toMatchObject({
      assessment: 1,
      path: 1,
      vault: 1,
      roles: 1,
      sessions: 1,
      accounts: 1,
    });

    // ---- act: replicate the route's transaction ----
    await db.transaction(async (tx) => {
      await tx.delete(schema.assessmentResults).where(eq(schema.assessmentResults.userId, user.id));
      await tx.delete(schema.userPathProgress).where(eq(schema.userPathProgress.userId, user.id));
      await tx.delete(schema.vaultEntries).where(eq(schema.vaultEntries.userId, user.id));
      await tx.delete(schema.userRoles).where(eq(schema.userRoles.userId, user.id));
      await tx.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
      await tx.delete(schema.accounts).where(eq(schema.accounts.userId, user.id));
      await tx.delete(schema.users).where(eq(schema.users.id, user.id));
    });

    // ---- assert: nothing left ----
    expect(await childCounts()).toEqual({
      assessment: 0,
      path: 0,
      vault: 0,
      roles: 0,
      sessions: 0,
      accounts: 0,
    });

    const stillThere = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, user.id));
    expect(stillThere.length).toBe(0);
  });

  test("FK cascade is the safety net — deleting the user alone removes children", async () => {
    const { db, schema, client } = await getTestDb();
    const email = `forget-me-cascade-${Date.now()}@example.test`;

    const [user] = await db
      .insert(schema.users)
      .values({ email, name: "Cascade", region: "IN" })
      .returning({ id: schema.users.id });

    await db.insert(schema.assessmentResults).values({
      userId: user.id,
      instrumentId: "gad7",
      rawScore: 4,
      severity: "minimal",
      flags: [],
    });
    await db.insert(schema.vaultEntries).values({
      userId: user.id,
      label: "cascade test",
      ciphertext: "AAAA",
      iv: "AAAAAAAAAAAAAAAA",
      salt: "BBBBBBBBBBBBBBBB",
    });

    // Delete ONLY the user. The schema's ON DELETE CASCADE must clean up.
    await db.delete(schema.users).where(eq(schema.users.id, user.id));

    expect(await rowCount(client, "assessment_results", "user_id", user.id)).toBe(0);
    expect(await rowCount(client, "vault_entries", "user_id", user.id)).toBe(0);
  });
});

async function rowCount(
  client: Awaited<ReturnType<typeof getTestDb>>["client"],
  table: string,
  fk: string,
  userId: string,
): Promise<number> {
  const rows = (await client.unsafe(
    `select count(*)::int as n from "${table}" where "${fk}" = $1`,
    [userId],
  )) as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
}
