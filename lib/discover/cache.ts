/**
 * Generic JSON cache for the Library "Discover" feature and AI-derived
 * artifacts (Topic Briefs, per-article key takeaways).
 *
 * Reuses the existing `help_search_cache` table with kind='discover' (no new
 * migration). Same stale-while-revalidate behaviour as Find Help: serve cached
 * instantly, refetch on expiry, hard cap absolute staleness, fall back to a
 * stale row if a recompute throws, and support a `force` refresh.
 */

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { helpSearchCache } from "@/lib/db/schema";

const MAX_STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type CachedJson<T> = {
  data: T;
  cached: boolean;
  stale: boolean;
  fetchedAt: Date | null;
};

function cacheKeyFor(key: string): string {
  return createHash("sha256").update(`discover:${key}`).digest("hex");
}

/**
 * Return a cached JSON payload if fresh enough; otherwise compute, persist, and
 * return. `compute` may be expensive (LLM + live API calls), so callers should
 * pass a stable, normalized `key`.
 */
export async function getOrComputeJson<T>({
  key,
  ttlMs,
  compute,
  force = false,
}: {
  key: string;
  ttlMs: number;
  compute: () => Promise<T>;
  force?: boolean;
}): Promise<CachedJson<T>> {
  if (!process.env.DATABASE_URL) {
    return { data: await compute(), cached: false, stale: false, fetchedAt: new Date() };
  }

  const cacheKey = cacheKeyFor(key);
  const existing = await db.query.helpSearchCache.findFirst({
    where: eq(helpSearchCache.cacheKey, cacheKey),
  });

  const now = Date.now();
  const isStale = existing ? new Date(existing.expiresAt).getTime() <= now : true;
  const tooOld = existing
    ? now - new Date(existing.fetchedAt).getTime() > MAX_STALE_MS
    : true;

  if (existing && !force && !tooOld) {
    const stored = (existing.results as unknown as [T])[0];
    return {
      data: stored,
      cached: true,
      stale: isStale,
      fetchedAt: new Date(existing.fetchedAt),
    };
  }

  try {
    const data = await compute();
    const fetchedAt = new Date();
    const expiresAt = new Date(now + ttlMs);
    await db
      .insert(helpSearchCache)
      .values({
        cacheKey,
        kind: "discover",
        query: { key },
        results: [data] as unknown as object[],
        source: "discover",
        fetchedAt,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: helpSearchCache.cacheKey,
        set: { results: [data] as unknown as object[], fetchedAt, expiresAt },
      });
    return { data, cached: false, stale: false, fetchedAt };
  } catch (err) {
    if (existing) {
      const stored = (existing.results as unknown as [T])[0];
      return {
        data: stored,
        cached: true,
        stale: isStale,
        fetchedAt: new Date(existing.fetchedAt),
      };
    }
    throw err;
  }
}
