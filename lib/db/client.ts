import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __pg: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __db: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

/**
 * Lazy DB client.
 *
 * postgres-js connections are only opened on first query, so we can construct
 * the client even with a placeholder URL — as long as the public route handlers
 * guard their query calls with a `process.env.DATABASE_URL` check (see
 * lib/db/queries.ts). This lets `next build` inspect every route without a DB.
 */
function getClient() {
  if (global.__pg) return global.__pg;
  const url =
    process.env.DATABASE_URL ?? "postgresql://localhost:5432/__not_configured__";
  // Serverless (Vercel) runs one request per instance, so a single connection
  // per warm instance is plenty; opening more just burns Neon's slot budget.
  // Idle connections are recycled quickly so reclaimed instances release them.
  const isServerless = !!process.env.VERCEL;
  const client = postgres(url, {
    max: isServerless ? 1 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  // Cache on global in ALL environments. Without this, the proxy below
  // rebuilt a fresh pool on every `db.*` access in production, leaking
  // connections until Postgres ran out of slots.
  global.__pg = client;
  return client;
}

function getDb() {
  if (global.__db) return global.__db;
  const d = drizzle(getClient(), { schema });
  global.__db = d;
  return d;
}

/**
 * Proxy so importers can use `db.query.x...` even before the connection is
 * lazily built. Property access triggers getDb() which is idempotent.
 */
export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_t, prop) {
    return Reflect.get(getDb(), prop);
  },
}) as ReturnType<typeof getDb>;

/**
 * Returns the *unwrapped* drizzle instance.
 *
 * Some libraries (e.g. `@auth/drizzle-adapter`) call `is(db, PgDatabase)`
 * which relies on `instanceof` / Symbol-based entity-kind detection that
 * does not survive the Proxy boundary above. Those callers must use this
 * function to obtain the real `PgDatabase` directly.
 */
export function getDbInstance() {
  return getDb();
}

export { schema };
