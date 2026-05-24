/**
 * Vitest setup. Pins a deterministic local KMS key so the KMS round-trip
 * tests pass without environment plumbing, and clamps the log level so
 * normal tests don't drown in JSON.
 *
 * Also: when INTEGRATION_DATABASE_URL is set, mirrors it into DATABASE_URL.
 * Several modules under test (`lib/db/client.ts`, `lib/search/hybrid.ts`,
 * `lib/ingest/pipeline.ts`) read DATABASE_URL directly; without this
 * mirror, integration specs would silently no-op on those code paths.
 */

if (!process.env.KMS_LOCAL_MASTER_KEY) {
  // Deterministic 32-byte test key. NEVER use this value outside of tests.
  process.env.KMS_LOCAL_MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
}
process.env.KMS_PROVIDER = process.env.KMS_PROVIDER ?? "local";
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";

if (process.env.INTEGRATION_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DATABASE_URL;
}
