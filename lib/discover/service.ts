/**
 * Discover service: cached entry point used by the page and the refresh API.
 *
 * Wraps the agent in the shared discover JSON cache (SWR + Refresh + 30-day cap)
 * and triggers the OA ingest flywheel only on a real (re)compute — never on a
 * cache hit — so we don't re-fetch full text on every page view.
 */

import { getOrComputeJson } from "./cache";
import { discover, type DiscoverResult } from "./agent";
import { ingestDiscoverFinds } from "./flywheel";

const DISCOVER_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);
}

export type CachedDiscover = {
  result: DiscoverResult;
  cached: boolean;
  stale: boolean;
  fetchedAt: Date | null;
};

export async function getDiscover(query: string, force = false): Promise<CachedDiscover> {
  const key = `topic:${normalizeQuery(query)}`;
  const { data, cached, stale, fetchedAt } = await getOrComputeJson<DiscoverResult>({
    key,
    ttlMs: DISCOVER_TTL,
    force,
    compute: async () => {
      const result = await discover(query);
      // Flywheel runs on compute only (cache miss / forced refresh).
      await ingestDiscoverFinds(result.ingestable);
      return result;
    },
  });
  return { result: data, cached, stale, fetchedAt };
}
