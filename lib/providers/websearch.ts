/**
 * Web-search provider for online communities (subreddits, Facebook groups,
 * Discord servers, Meetup groups) that aren't geocoded "places".
 *
 * Supports Brave Search API (default) and Tavily as a fallback. Requires
 * BRAVE_API_KEY or TAVILY_API_KEY. No-ops (returns empty) when neither is set.
 * Uses official APIs only — never scrapes search result pages.
 */

export type WebHit = {
  ref: string; // hashed url — stable id for moderation
  title: string;
  url: string;
  description: string;
  host: string;
  source: "web";
};

export function webSearchConfigured(): boolean {
  return !!(process.env.BRAVE_API_KEY || process.env.TAVILY_API_KEY);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Tiny stable hash for a result ref (djb2 -> base36). */
function hashRef(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export async function webSearch({
  query,
  count = 10,
  signal,
}: {
  query: string;
  count?: number;
  signal?: AbortSignal;
}): Promise<WebHit[]> {
  if (process.env.BRAVE_API_KEY) return braveSearch({ query, count, signal });
  if (process.env.TAVILY_API_KEY) return tavilySearch({ query, count, signal });
  return [];
}

type BraveResponse = {
  web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
};

async function braveSearch({
  query,
  count,
  signal,
}: {
  query: string;
  count: number;
  signal?: AbortSignal;
}): Promise<WebHit[]> {
  const params = new URLSearchParams({ q: query, count: String(Math.min(count, 20)) });
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": process.env.BRAVE_API_KEY ?? "",
    },
    signal,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as BraveResponse;
  return (data.web?.results ?? [])
    .filter((r) => r.url && r.title)
    .map((r) => {
      const url = r.url as string;
      return {
        ref: hashRef(url),
        title: r.title as string,
        url,
        description: (r.description ?? "").replace(/<[^>]+>/g, ""),
        host: hostOf(url),
        source: "web" as const,
      };
    });
}

type TavilyResponse = {
  results?: Array<{ title?: string; url?: string; content?: string }>;
};

async function tavilySearch({
  query,
  count,
  signal,
}: {
  query: string;
  count: number;
  signal?: AbortSignal;
}): Promise<WebHit[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      max_results: Math.min(count, 20),
      search_depth: "basic",
    }),
    signal,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as TavilyResponse;
  return (data.results ?? [])
    .filter((r) => r.url && r.title)
    .map((r) => {
      const url = r.url as string;
      return {
        ref: hashRef(url),
        title: r.title as string,
        url,
        description: r.content ?? "",
        host: hostOf(url),
        source: "web" as const,
      };
    });
}
