/**
 * Discovery agent.
 *
 * Pulls fresh, allowlist-aligned content from public APIs:
 *   - PubMed Central OA: open-access biomedical articles.
 *   - Crossref: DOI metadata for journal articles.
 *   - Open Library: book metadata for sex-therapy authors we've
 *     allowlisted.
 *
 * Workflow per candidate:
 *   1. Pull recent results matching our topic queries.
 *   2. Filter to allowlisted sources.
 *   3. Skip anything we already have (match by DOI / ISBN / URL).
 *   4. LLM gate: ask the configured chat model whether the content is
 *      a good fit for an evidence-grounded sex-therapy library, with
 *      a Zod-validated yes/no + reasoning output.
 *   5. Emit `new_resource` proposal with all metadata pre-filled.
 *
 * The agent is deliberately conservative — confidence < 70 doesn't
 * surface in the admin's primary list. A human still approves every
 * single discovery before it lands in the catalog.
 */

import { eq } from "drizzle-orm";
import { generateObject } from "ai";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { resources, sources } from "@/lib/db/schema";
import { ALLOWLIST, publisherToAllowlist } from "@/lib/ingest/allowlist";
import { chatModel, isLlmConfigured } from "@/lib/ai/llm";
import { log } from "@/lib/observability/logger";
import { submitProposal } from "./proposals";

const PROPOSED_BY = "agent:discovery";
// NCBI / Crossref are happy with a polite identifier. Open Library 403s
// any UA string that contains a "+https://..." URL fragment, even from
// well-known archiving bots, so we strip the URL from OL's UA specifically.
const USER_AGENT = "ISTL-Discovery/1.0";
const OPEN_LIBRARY_UA = "Mozilla/5.0 (compatible; ISTLBot/1.0)";

/** Topics we hunt for on every run. Tuned for our taxonomy. */
const QUERIES = [
  "sex therapy outcomes",
  "couples therapy desire discrepancy",
  "vaginismus treatment cognitive behavioral",
  "erectile dysfunction performance anxiety",
  "asexual identity affirming care",
  "LGBTQ affirming sex therapy",
  "sexual trauma somatic therapy",
  "postpartum sexual dysfunction",
  "sensate focus mindfulness",
];

const FitGate = z.object({
  fits: z.boolean(),
  reasoning: z.string().max(280),
  /** 0–100 confidence the agent feels about the fit decision. */
  confidence: z.number().min(0).max(100),
  /** Suggested catalog topic slug. */
  topicHint: z
    .string()
    .max(64)
    .optional()
    .describe("Suggested topic slug if the resource fits, else omit."),
});

export type DiscoveryCandidate = {
  source: "pubmed" | "crossref" | "open-library";
  externalId: string; // DOI / PMC ID / OL ID
  title: string;
  authors: string[];
  url: string;
  publishedYear: number | null;
  abstract: string | null;
  /** Slug of an ALLOWLIST entry. */
  sourceSlug: string;
};

export type DiscoverySummary = {
  candidatesFound: number;
  alreadyInCatalog: number;
  llmRejected: number;
  llmAccepted: number;
  proposalsEmitted: number;
  /** Per-source breakdown so the admin UI can show "PubMed: 12 found / 3 emitted". */
  perSource: {
    pubmed: { found: number; emitted: number };
    crossref: { found: number; emitted: number };
    "open-library": { found: number; emitted: number };
  };
  errors: Array<{ source: string; query: string; reason: string }>;
};

const SLUG_PUBMED = "pmc-oa";

export async function runDiscoveryAgent(opts?: {
  limitPerQuery?: number;
  /** Cap total PubMed lookback (days). Default 730 (2 years). */
  pubmedWindowDays?: number;
}): Promise<DiscoverySummary> {
  const summary: DiscoverySummary = {
    candidatesFound: 0,
    alreadyInCatalog: 0,
    llmRejected: 0,
    llmAccepted: 0,
    proposalsEmitted: 0,
    perSource: {
      pubmed: { found: 0, emitted: 0 },
      crossref: { found: 0, emitted: 0 },
      "open-library": { found: 0, emitted: 0 },
    },
    errors: [],
  };

  const limitPerQuery = opts?.limitPerQuery ?? 5;
  const pubmedWindowDays = opts?.pubmedWindowDays ?? 730;
  const known = await knownExternalIds();

  for (const query of QUERIES) {
    const cands: DiscoveryCandidate[] = [];

    const fromPubMed = await searchPubMed(query, limitPerQuery, pubmedWindowDays).catch(
      (e) => {
        summary.errors.push({ source: "pubmed", query, reason: String(e?.message ?? e).slice(0, 200) });
        return [] as DiscoveryCandidate[];
      },
    );
    summary.perSource.pubmed.found += fromPubMed.length;
    cands.push(...fromPubMed);

    const fromCrossref = await searchCrossref(query, limitPerQuery, pubmedWindowDays).catch(
      (e) => {
        summary.errors.push({ source: "crossref", query, reason: String(e?.message ?? e).slice(0, 200) });
        return [] as DiscoveryCandidate[];
      },
    );
    summary.perSource.crossref.found += fromCrossref.length;
    cands.push(...fromCrossref);

    const fromOL = await searchOpenLibrary(query, 2).catch((e) => {
      summary.errors.push({ source: "open-library", query, reason: String(e?.message ?? e).slice(0, 200) });
      return [] as DiscoveryCandidate[];
    });
    summary.perSource["open-library"].found += fromOL.length;
    cands.push(...fromOL);

    summary.candidatesFound += cands.length;

    for (const c of cands) {
      const key = candidateKey(c);
      if (known.has(key)) {
        summary.alreadyInCatalog += 1;
        continue;
      }
      // Cap LLM cost — only run the gate when we have credentials.
      if (!isLlmConfigured()) {
        // Even without LLM, emit a low-confidence proposal so a human
        // can decide. Prefix the summary so the admin knows it's raw.
        const result = await submitProposal({
          kind: "new_resource",
          proposedBy: PROPOSED_BY,
          payload: {
            source: c.source,
            externalId: c.externalId,
            title: c.title,
            authors: c.authors,
            url: c.url,
            publishedYear: c.publishedYear,
            sourceSlug: c.sourceSlug,
            abstract: c.abstract,
            llmGate: "skipped:no_llm",
          },
          summary: `[ungated] New candidate: ${c.title.slice(0, 70)}`,
          evidence: { source: c.source, query },
          confidence: 30,
        });
        if (result.inserted) summary.proposalsEmitted += 1;
        continue;
      }

      const fit = await runFitGate(c).catch(() => null);
      if (!fit) {
        summary.llmRejected += 1;
        continue;
      }
      if (!fit.fits) {
        summary.llmRejected += 1;
        continue;
      }
      summary.llmAccepted += 1;

      const result = await submitProposal({
        kind: "new_resource",
        proposedBy: PROPOSED_BY,
        payload: {
          source: c.source,
          externalId: c.externalId,
          title: c.title,
          authors: c.authors,
          url: c.url,
          publishedYear: c.publishedYear,
          sourceSlug: c.sourceSlug,
          abstract: c.abstract,
          topicHint: fit.topicHint ?? null,
        },
        summary: `New candidate: ${c.title.slice(0, 70)}`,
        evidence: {
          source: c.source,
          query,
          llmGate: { fits: fit.fits, reasoning: fit.reasoning, confidence: fit.confidence },
        },
        confidence: Math.max(40, Math.min(95, fit.confidence)),
      });
      if (result.inserted) {
        summary.proposalsEmitted += 1;
        summary.perSource[c.source].emitted += 1;
      }
    }
  }

  log.info("discovery_run_complete", {
    candidatesFound: summary.candidatesFound,
    proposalsEmitted: summary.proposalsEmitted,
    perSource: summary.perSource,
    errors: summary.errors.length,
  });

  return summary;
}

async function knownExternalIds(): Promise<Set<string>> {
  const rows = await db
    .select({ externalUrl: resources.externalUrl, sourceId: resources.sourceId })
    .from(resources);
  const set = new Set<string>();
  for (const r of rows) {
    set.add(canonicaliseUrl(r.externalUrl));
  }
  return set;
}

function canonicaliseUrl(u: string): string {
  try {
    const url = new URL(u);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

function candidateKey(c: DiscoveryCandidate): string {
  return canonicaliseUrl(c.url);
}

async function runFitGate(c: DiscoveryCandidate): Promise<z.infer<typeof FitGate>> {
  const system = `You gate which articles / books are appropriate for an evidence-grounded sex-therapy library aimed at adults in India.

Accept ONLY if all of:
- Authored or co-authored by credentialed clinicians or peer-reviewed researchers.
- Topic is in scope: sexual health, sex therapy, couples / intimacy, gender-affirming care, asexual spectrum, or directly related (trauma + intimacy, postpartum, perimenopause, etc.).
- Tone is non-pathologising, non-moralising. NO purity culture, NO "sex addiction" framing, NO conversion-therapy adjacent.
- Specific to clinical interventions or research findings, not general op-ed.

Reject (with reasoning) anything that's:
- About non-clinical opinion, lifestyle, religion-driven advice.
- Children / underage content (regardless of intent).
- Medical-dosing specifics.
- Sexually explicit performance content.

Return a strict JSON object matching the schema.`;

  const prompt = `CANDIDATE
Title: ${c.title}
Authors: ${c.authors.slice(0, 6).join(", ") || "—"}
Year: ${c.publishedYear ?? "—"}
Source: ${c.source} (${c.sourceSlug})
URL: ${c.url}
Abstract: ${(c.abstract ?? "").slice(0, 1500)}
`;

  const { object } = await generateObject({
    model: chatModel(),
    system,
    prompt,
    schema: FitGate,
    temperature: 0.1,
  });
  return object;
}

// ---------------------------------------------------------------------------
// PubMed
// ---------------------------------------------------------------------------

async function searchPubMed(
  query: string,
  limit: number,
  windowDays: number,
): Promise<DiscoveryCandidate[]> {
  // The catalog row uses slug "pmc-oa" (PubMed Central Open Access). A
  // prior version of this code looked up "pubmed-central", which silently
  // returned [] every run because no allowlist entry has that slug. That
  // was the entire reason /admin/proposals never showed `new_resource`
  // cards.
  const allowed = ALLOWLIST.find((s) => s.slug === SLUG_PUBMED);
  if (!allowed) {
    log.warn("discovery_pubmed_no_allowlist", { expected: SLUG_PUBMED });
    return [];
  }

  // Use NCBI eutils esearch then esummary. Both are free and require no key.
  // Date filtering uses the dedicated `reldate` + `datetype=pdat` params —
  // an inline `AND last N days[dp]` in the term string is parsed
  // differently and reliably returns count=0 for any query, which was the
  // root cause of the empty PubMed discovery for many runs.
  const esearchParams = new URLSearchParams({
    db: "pubmed",
    retmode: "json",
    retmax: String(limit),
    datetype: "pdat",
    reldate: String(windowDays),
    term: query,
  });
  const esearch = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${esearchParams.toString()}`,
    { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(12_000) },
  );
  if (!esearch.ok) {
    throw new Error(`pubmed esearch http ${esearch.status}`);
  }
  const ids =
    ((await esearch.json()) as { esearchresult?: { idlist?: string[] } }).esearchresult?.idlist ??
    [];
  if (ids.length === 0) return [];

  const summaries = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`,
    { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(12_000) },
  );
  if (!summaries.ok) {
    throw new Error(`pubmed esummary http ${summaries.status}`);
  }
  const data = (await summaries.json()) as {
    result?: Record<
      string,
      {
        uid?: string;
        title?: string;
        authors?: { name: string }[];
        pubdate?: string;
        articleids?: { idtype: string; value: string }[];
        source?: string;
      }
    >;
  };
  const out: DiscoveryCandidate[] = [];
  for (const id of ids) {
    const d = data.result?.[id];
    if (!d?.title) continue;
    const yr = parseYear(d.pubdate ?? "");
    const doi = d.articleids?.find((a) => a.idtype === "doi")?.value;
    out.push({
      source: "pubmed",
      externalId: id,
      title: d.title,
      authors: (d.authors ?? []).slice(0, 8).map((a) => a.name),
      url: doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      publishedYear: yr,
      abstract: null, // skip abstract fetch to save quota; LLM works fine without
      sourceSlug: SLUG_PUBMED,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Crossref — DOI metadata for journal articles. Covers all open-access journals
// plus closed-access ones with public metadata (we deep-link only for those).
// ---------------------------------------------------------------------------

/**
 * Map an ISSN / publisher returned by Crossref onto one of our allowlisted
 * journal entries. We're conservative: only accept hits whose ISSN appears in
 * `ISSN_TO_SLUG` or whose publisher field aliases match.
 */
const ISSN_TO_SLUG: Record<string, string> = {
  // PLOS ONE
  "1932-6203": "plos-one",
  // BMC Women's Health (eISSN)
  "1472-6874": "bmc-womens-health",
  // Journal of Medical Internet Research
  "1438-8871": "jmir",
  // Sexual Medicine (Oxford)
  "2050-1161": "sexual-medicine-oa",
};

async function searchCrossref(
  query: string,
  limit: number,
  windowDays: number,
): Promise<DiscoveryCandidate[]> {
  // Crossref REST API. `mailto=` is the polite-pool identifier; cheap to add.
  const cutoff = new Date(Date.now() - windowDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const url =
    `https://api.crossref.org/works?` +
    new URLSearchParams({
      query,
      rows: String(Math.max(5, limit * 3)),
      filter: `from-pub-date:${cutoff},type:journal-article`,
      "mailto": "library@intimacy-and-sex-therapy-library.vercel.app",
      sort: "relevance",
    }).toString();

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    throw new Error(`crossref http ${res.status}`);
  }
  const json = (await res.json()) as {
    message?: {
      items?: Array<{
        DOI?: string;
        title?: string[];
        author?: Array<{ given?: string; family?: string }>;
        ISSN?: string[];
        publisher?: string;
        abstract?: string;
        issued?: { "date-parts"?: number[][] };
        URL?: string;
      }>;
    };
  };
  const items = json.message?.items ?? [];
  const out: DiscoveryCandidate[] = [];
  for (const it of items) {
    const doi = (it.DOI ?? "").trim();
    if (!doi) continue;
    const title = (it.title ?? [])[0]?.trim();
    if (!title) continue;

    // Resolve to one of our allowlisted journals. Prefer ISSN match; fall
    // back to publisher-string alias match. Anything else is dropped.
    let sourceSlug: string | null = null;
    for (const issn of it.ISSN ?? []) {
      const slug = ISSN_TO_SLUG[issn];
      if (slug) {
        sourceSlug = slug;
        break;
      }
    }
    if (!sourceSlug) {
      const allow = publisherToAllowlist(it.publisher ?? null);
      if (allow && allow.kind === "journal") sourceSlug = allow.slug;
    }
    if (!sourceSlug) continue;

    const year = it.issued?.["date-parts"]?.[0]?.[0] ?? null;
    out.push({
      source: "crossref",
      externalId: doi,
      title,
      authors: (it.author ?? [])
        .slice(0, 8)
        .map((a) =>
          [a.given, a.family].filter(Boolean).join(" ").trim() || "—",
        )
        .filter((s) => s !== "—"),
      url: it.URL ?? `https://doi.org/${doi}`,
      publishedYear: typeof year === "number" ? year : null,
      abstract: cleanAbstract(it.abstract ?? null),
      sourceSlug,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function cleanAbstract(raw: string | null): string | null {
  if (!raw) return null;
  // Crossref sometimes ships JATS-wrapped abstracts. Strip tags.
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2_000) || null;
}

// ---------------------------------------------------------------------------
// Open Library
// ---------------------------------------------------------------------------

async function searchOpenLibrary(query: string, limit: number): Promise<DiscoveryCandidate[]> {
  // Pull more docs than `limit` so the allowlisted-publisher filter has
  // enough headroom — most results won't match our small publisher list.
  const res = await fetch(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit * 10}`,
    { headers: { "User-Agent": OPEN_LIBRARY_UA }, signal: AbortSignal.timeout(12_000) },
  );
  if (!res.ok) {
    throw new Error(`open-library http ${res.status}`);
  }
  const data = (await res.json()) as {
    docs?: Array<{
      key: string;
      title: string;
      author_name?: string[];
      first_publish_year?: number;
      publisher?: string[];
    }>;
  };
  const out: DiscoveryCandidate[] = [];
  for (const d of data.docs ?? []) {
    // Iterate publisher fields; first one that resolves to an allowlisted
    // entry wins. Open Library frequently lists multiple imprints.
    let sourceSlug: string | null = null;
    for (const p of d.publisher ?? []) {
      const allow = publisherToAllowlist(p);
      if (allow) {
        sourceSlug = allow.slug;
        break;
      }
    }
    if (!sourceSlug) continue;
    out.push({
      source: "open-library",
      externalId: d.key,
      title: d.title,
      authors: (d.author_name ?? []).slice(0, 6),
      url: `https://openlibrary.org${d.key}`,
      publishedYear: d.first_publish_year ?? null,
      abstract: null,
      sourceSlug,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function parseYear(s: string): number | null {
  const m = s.match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

/**
 * Best-effort source-id lookup for downstream consumers; the proposals
 * approver uses this to set `resource.source_id` after approval.
 */
export async function sourceIdForSlug(slug: string): Promise<string | null> {
  const r = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.slug, slug))
    .limit(1);
  return r[0]?.id ?? null;
}
