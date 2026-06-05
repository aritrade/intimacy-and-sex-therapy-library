/**
 * Postgres-backed cache for Find Help aggregated results.
 *
 * Keyed by a sha256 of the normalized query (no user identifiers). Serves rows
 * while fresh, refetches on expiry, and falls back to a stale row if a refetch
 * fails. Globally-hidden results (admin-moderated via help_result_flags) are
 * filtered out on read.
 */

import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { helpResultFlags, helpSearchCache } from "@/lib/db/schema";

export type FetchOutput = { results: Array<{ ref: string }>; source: string };

export type CacheResult<T> = {
  results: T[];
  cached: boolean;
  source: string;
};

function normalize(query: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(query).sort()) {
    const v = query[k];
    out[k] = typeof v === "string" ? v.trim().toLowerCase() : v;
  }
  return out;
}

function cacheKeyFor(kind: string, query: Record<string, unknown>): string {
  return createHash("sha256")
    .update(`${kind}:${JSON.stringify(normalize(query))}`)
    .digest("hex");
}

async function filterHidden<T extends { ref: string }>(results: T[]): Promise<T[]> {
  const refs = results.map((r) => r.ref).filter(Boolean);
  if (refs.length === 0) return results;
  const hidden = await db
    .select({ ref: helpResultFlags.resultRef })
    .from(helpResultFlags)
    .where(and(eq(helpResultFlags.hidden, true), inArray(helpResultFlags.resultRef, refs)));
  if (hidden.length === 0) return results;
  const hiddenSet = new Set(hidden.map((h) => h.ref));
  return results.filter((r) => !hiddenSet.has(r.ref));
}

/**
 * Return cached results if fresh; otherwise run `fetcher`, persist, and return.
 * `T` must carry a `ref` field so moderation + dedupe work.
 */
export async function getOrFetch<T extends { ref: string }>({
  kind,
  query,
  ttlMs,
  fetcher,
  force = false,
}: {
  kind: "clinicians" | "communities";
  query: Record<string, unknown>;
  ttlMs: number;
  fetcher: () => Promise<{ results: T[]; source: string }>;
  force?: boolean;
}): Promise<CacheResult<T>> {
  if (!process.env.DATABASE_URL) {
    // No DB: skip caching entirely, just fetch live.
    const fresh = await fetcher();
    return { results: await filterHidden(fresh.results), cached: false, source: fresh.source };
  }

  const cacheKey = cacheKeyFor(kind, query);
  const existing = await db.query.helpSearchCache.findFirst({
    where: eq(helpSearchCache.cacheKey, cacheKey),
  });

  const now = Date.now();
  const fresh = existing && new Date(existing.expiresAt).getTime() > now;
  if (existing && fresh && !force) {
    return {
      results: await filterHidden(existing.results as T[]),
      cached: true,
      source: existing.source,
    };
  }

  try {
    const out = await fetcher();
    const expiresAt = new Date(now + ttlMs);
    await db
      .insert(helpSearchCache)
      .values({
        cacheKey,
        kind,
        query: normalize(query),
        results: out.results,
        source: out.source,
        fetchedAt: new Date(),
        expiresAt,
      })
      .onConflictDoUpdate({
        target: helpSearchCache.cacheKey,
        set: {
          results: out.results,
          source: out.source,
          fetchedAt: new Date(),
          expiresAt,
        },
      });
    return { results: await filterHidden(out.results), cached: false, source: out.source };
  } catch {
    // Refetch failed — serve a stale row if we have one rather than nothing.
    if (existing) {
      return {
        results: await filterHidden(existing.results as T[]),
        cached: true,
        source: existing.source,
      };
    }
    return { results: [], cached: false, source: "none" };
  }
}
