import { afterEach, expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { describeIntegration, getTestDb } from "./_db";
import { recordAudit, recordCrisisEvents } from "@/lib/observability/audit";

describeIntegration("content-free observability writes", () => {
  afterEach(async () => {
    const { client } = await getTestDb();
    await client`delete from audit_log where action like 'p12-%'`;
    await client`delete from crisis_events where surface = 'chat' and category like 'p12-%'`;
  });

  test("recordAudit hashes the actor and scrubs meta", async () => {
    await recordAudit({
      actor: "actor-original-id",
      action: "p12-test-action",
      meta: {
        // The scrubber must replace these in the persisted JSON.
        prompt: "very private user content",
        email: "user@example.com",
        ok: true,
        n: 42,
      },
    });

    const { db, schema } = await getTestDb();
    const rows = await db
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.action} = 'p12-test-action'`);

    expect(rows.length).toBe(1);
    const r = rows[0];
    expect(r.actorHash).toMatch(/^[0-9a-f]{16}$/);
    expect(r.actorHash).not.toBe("actor-original-id");

    const meta = r.meta as Record<string, unknown>;
    // scrubber rules: drop dangerous keys, hash correlation keys, keep neutrals
    expect(meta.prompt).toBe("[redacted]");
    expect(String(meta.email ?? "")).toMatch(/^sha256:/);
    expect(meta.ok).toBe(true);
    expect(meta.n).toBe(42);
  });

  test("recordCrisisEvents writes one row per category, hashed fingerprint", async () => {
    await recordCrisisEvents({
      surface: "chat",
      categories: ["p12-self_harm", "p12-domestic_violence"],
      fingerprint: "session-fingerprint-original",
    });

    const { client } = await getTestDb();
    const rows = (await client`
      select session_fingerprint, category, surface
        from crisis_events
       where category like 'p12-%'
       order by category
    `) as Array<{ session_fingerprint: string; category: string; surface: string }>;

    expect(rows.length).toBe(2);
    expect(rows[0].surface).toBe("chat");
    expect(rows[0].session_fingerprint).toMatch(/^[0-9a-f]{16}$/);
    // Both rows share the SAME fingerprint hash (we want correlation).
    expect(rows[0].session_fingerprint).toBe(rows[1].session_fingerprint);
    // The fingerprint hash MUST NOT be the original input.
    expect(rows[0].session_fingerprint).not.toBe("session-fingerprint-original");
  });

  test("recordCrisisEvents with empty categories writes nothing", async () => {
    const { client } = await getTestDb();
    const before = (await client`select count(*)::int as n from crisis_events`) as Array<{
      n: number;
    }>;
    await recordCrisisEvents({
      surface: "companion",
      categories: [],
      fingerprint: "anything",
    });
    const after = (await client`select count(*)::int as n from crisis_events`) as Array<{
      n: number;
    }>;
    expect(after[0].n).toBe(before[0].n);
  });
});
