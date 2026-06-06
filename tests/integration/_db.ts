/**
 * Integration-test database helper.
 *
 * Strategy:
 *
 *   - Tests are gated behind INTEGRATION_DATABASE_URL. When unset, every
 *     spec calls `requireIntegrationDb()` which `test.skip`s the whole
 *     describe block — useful for laptops without Docker.
 *
 *   - When set, we connect, run the migrator + 0001_indexes.sql once, and
 *     hand each spec a per-test schema-cleaning helper.
 *
 *   - The DB is treated as disposable: every test cleans the tables it
 *     writes to (we do NOT TRUNCATE everything between tests, because that
 *     would also wipe the seeded allowlist; specific tests do their own
 *     ad-hoc cleanup).
 *
 * To run locally:
 *
 *   docker run --rm -d --name stl-test-pg -p 5499:5432 \
 *     -e POSTGRES_PASSWORD=test pgvector/pgvector:pg16
 *   docker exec stl-test-pg psql -U postgres \
 *     -c "CREATE DATABASE stl_test;"
 *   INTEGRATION_DATABASE_URL=postgresql://postgres:test@localhost:5499/stl_test \
 *     npm run test:integration
 *
 * In GitHub Actions a `services:` block does the same thing.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, test } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { HAND_WRITTEN_MIGRATIONS } from "@/lib/db/hand-written-migrations";

export type TestDb = {
  client: ReturnType<typeof postgres>;
  db: ReturnType<typeof drizzle<typeof schema>>;
  schema: typeof schema;
};

let cached: TestDb | null = null;
let migrated = false;

export function integrationUrl(): string | null {
  return process.env.INTEGRATION_DATABASE_URL || null;
}

/**
 * Connect (lazily) and run migrations once per process. Returns the shared
 * connection. The caller should NOT close it; teardown happens in
 * `afterAllIntegration()`.
 */
export async function getTestDb(): Promise<TestDb> {
  const url = integrationUrl();
  if (!url) {
    throw new Error(
      "getTestDb() called without INTEGRATION_DATABASE_URL — wrap your suite in `describeIntegration` instead.",
    );
  }
  if (cached) return cached;

  const client = postgres(url, { max: 4, prepare: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  cached = { client, db, schema };

  if (!migrated) {
    // Enable extensions BEFORE migrate runs — the schema references the
    // `vector` type and pg_trgm operators, which require the extension on
    // each fresh database (the pgvector/pgvector image bundles the binary
    // but does NOT auto-enable the extension per DB).
    await client`CREATE EXTENSION IF NOT EXISTS vector`;
    await client`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    // Pretend we live in the project root so paths to drizzle/ resolve.
    await migrate(db, { migrationsFolder: "./drizzle" });
    // Apply the SAME hand-written migrations production runs (single source of
    // truth in lib/db/hand-written-migrations.ts) so the test DB never drifts
    // from prod — previously this list was a stale subset (0001 + 0002 only),
    // which is why specs hit "column grounding does not exist". All files are
    // idempotent, so applying the full list on a fresh DB is safe.
    for (const [, sqlFile] of HAND_WRITTEN_MIGRATIONS) {
      const sqlPath = join(process.cwd(), "drizzle", sqlFile);
      await client.unsafe(readFileSync(sqlPath, "utf8"));
    }
    migrated = true;
  }
  return cached;
}

/** Per-process teardown. Call once from a global vitest hook. */
export async function teardownTestDb(): Promise<void> {
  if (!cached) return;
  await cached.client.end({ timeout: 5 });
  cached = null;
  migrated = false;
}

/**
 * Wrapper that skips the whole describe block when no integration DB is
 * configured. Use instead of vitest's plain `describe`.
 */
export function describeIntegration(name: string, fn: () => void) {
  const url = integrationUrl();
  if (!url) {
    describe.skip(`${name} (no INTEGRATION_DATABASE_URL)`, () => {
      test("skipped — set INTEGRATION_DATABASE_URL to run integration tests", () => {});
    });
    return;
  }

  describe(name, () => {
    beforeAll(async () => {
      await getTestDb();
    });
    afterAll(async () => {
      // Pool closure happens once at process exit (see `beforeExit` below).
    });
    fn();
  });
}

/**
 * Global teardown — registered automatically when this module is imported.
 * Vitest accepts an `afterAll` at the top level of a setup file; we keep
 * close logic here so suites don't have to think about it.
 */
process.on("beforeExit", () => {
  void teardownTestDb();
});
