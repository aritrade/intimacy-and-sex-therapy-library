/**
 * Live scholarly / web candidate fetchers for the Library "Discover" agent.
 *
 * All sources are free and (except Tavily) keyless. Every fetcher degrades to
 * [] on error or timeout so Discover never hard-fails on a flaky upstream:
 *   - Europe PMC  — open-access biomedical articles (full text → flywheel).
 *   - OpenAlex    — broad scholarly index with abstracts + OA flags (no key).
 *   - Open Library — book metadata (authorized deep-links, never hosted).
 *   - Tavily      — plain-language explainers from the web (existing key).
 */

import { searchEuropePmc, type PmcHit } from "@/lib/ingest/sources/pmc";
import { webSearch } from "@/lib/providers/websearch";

export type CandidateKind = "corpus" | "article" | "book" | "web";

export type Candidate = {
  ref: string;
  kind: CandidateKind;
  title: string;
  url: string;
  authors: string[];
  year: number | null;
  snippet: string;
  source: string;
  openAccess: boolean;
  inLibrary: boolean;
  resourceId?: string;
  /** Present for Europe PMC OA hits so the flywheel can ingest full text. */
  pmcHit?: PmcHit;
};

const TIMEOUT_MS = 12_000;
const POLITE_MAILTO = "library@intimacy-and-sex-therapy-library.vercel.app";

function hashRef(prefix: string, s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return `${prefix}_${(h >>> 0).toString(36)}`;
}

export function canonicalUrl(u: string): string {
  try {
    const url = new URL(u);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

export async function fetchEuropePmcCandidates(query: string, limit = 6): Promise<Candidate[]> {
  try {
    const hits = await searchEuropePmc({
      query,
      limit,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return hits.map((h) => ({
      ref: hashRef("pmc", h.externalUrl),
      kind: "article" as const,
      title: h.title,
      url: h.externalUrl,
      authors: h.authors,
      year: h.publishedYear ?? null,
      snippet: (h.abstract ?? "").slice(0, 1200),
      source: "Europe PMC",
      openAccess: true,
      inLibrary: false,
      pmcHit: h,
    }));
  } catch {
    return [];
  }
}

type OpenAlexWork = {
  id?: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  open_access?: { is_oa?: boolean } | null;
  primary_location?: { landing_page_url?: string | null } | null;
  authorships?: Array<{ author?: { display_name?: string } }>;
};

function reconstructAbstract(idx: Record<string, number[]> | null | undefined): string {
  if (!idx) return "";
  const slots: string[] = [];
  for (const [word, positions] of Object.entries(idx)) {
    for (const p of positions) slots[p] = word;
  }
  return slots.filter(Boolean).join(" ").slice(0, 1200);
}

export async function fetchOpenAlexCandidates(query: string, limit = 6): Promise<Candidate[]> {
  try {
    const url =
      `https://api.openalex.org/works?` +
      new URLSearchParams({
        search: query,
        per_page: String(limit),
        sort: "relevance_score:desc",
        mailto: POLITE_MAILTO,
      }).toString();
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: OpenAlexWork[] };
    const out: Candidate[] = [];
    for (const w of data.results ?? []) {
      const title = (w.title ?? w.display_name ?? "").trim();
      if (!title) continue;
      const link =
        w.primary_location?.landing_page_url ||
        (w.doi ? (w.doi.startsWith("http") ? w.doi : `https://doi.org/${w.doi.replace(/^doi:/, "")}`) : "") ||
        w.id ||
        "";
      if (!link) continue;
      out.push({
        ref: hashRef("oa", link),
        kind: "article",
        title,
        url: link,
        authors: (w.authorships ?? [])
          .slice(0, 8)
          .map((a) => a.author?.display_name ?? "")
          .filter(Boolean),
        year: w.publication_year ?? null,
        snippet: reconstructAbstract(w.abstract_inverted_index),
        source: "OpenAlex",
        openAccess: !!w.open_access?.is_oa,
        inLibrary: false,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function fetchOpenLibraryCandidates(query: string, limit = 3): Promise<Candidate[]> {
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit * 4}&fields=key,title,author_name,first_publish_year,first_sentence`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ISTLBot/1.0)" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      docs?: Array<{
        key: string;
        title: string;
        author_name?: string[];
        first_publish_year?: number;
        first_sentence?: string[] | { value?: string };
      }>;
    };
    const out: Candidate[] = [];
    for (const d of data.docs ?? []) {
      if (!d.title) continue;
      const sentence = Array.isArray(d.first_sentence)
        ? d.first_sentence[0]
        : d.first_sentence?.value;
      out.push({
        ref: hashRef("ol", d.key),
        kind: "book",
        title: d.title,
        url: `https://openlibrary.org${d.key}`,
        authors: (d.author_name ?? []).slice(0, 4),
        year: d.first_publish_year ?? null,
        snippet: (sentence ?? "").slice(0, 600),
        source: "Open Library",
        openAccess: false,
        inLibrary: false,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

export async function fetchWebCandidates(query: string, count = 5): Promise<Candidate[]> {
  try {
    const hits = await webSearch({
      query: `${query} explainer evidence based`,
      count,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return hits.map((h) => ({
      ref: hashRef("web", h.url),
      kind: "web" as const,
      title: h.title,
      url: h.url,
      authors: [],
      year: null,
      snippet: h.description.slice(0, 600),
      source: h.host,
      openAccess: false,
      inLibrary: false,
    }));
  } catch {
    return [];
  }
}
