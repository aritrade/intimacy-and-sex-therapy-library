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
import { ALLOWLIST } from "@/lib/ingest/allowlist";
import { chatModel, isLlmConfigured } from "@/lib/ai/llm";
import { submitProposal } from "./proposals";

const PROPOSED_BY = "agent:discovery";
const USER_AGENT =
  "ISTL-Discovery/1.0 (+https://intimacy-and-sex-therapy-library.vercel.app/about)";

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
};

export async function runDiscoveryAgent(opts?: {
  limitPerQuery?: number;
}): Promise<DiscoverySummary> {
  const summary: DiscoverySummary = {
    candidatesFound: 0,
    alreadyInCatalog: 0,
    llmRejected: 0,
    llmAccepted: 0,
    proposalsEmitted: 0,
  };

  const known = await knownExternalIds();

  for (const query of QUERIES) {
    const cands: DiscoveryCandidate[] = [];
    cands.push(...(await searchPubMed(query, opts?.limitPerQuery ?? 5)).slice(0, opts?.limitPerQuery ?? 5));
    cands.push(...(await searchOpenLibrary(query, 2)));
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
      if (result.inserted) summary.proposalsEmitted += 1;
    }
  }

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

async function searchPubMed(query: string, limit: number): Promise<DiscoveryCandidate[]> {
  const allowed = ALLOWLIST.find((s) => s.slug === "pubmed-central");
  if (!allowed) return []; // catalog has no allowlist entry yet
  // Use NCBI eutils esearch then esummary. Both are free and require no key.
  try {
    const esearch = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=${limit}&term=${encodeURIComponent(
        `${query} AND last 365 days[dp]`,
      )}`,
      { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(12_000) },
    );
    if (!esearch.ok) return [];
    const ids =
      ((await esearch.json()) as { esearchresult?: { idlist?: string[] } }).esearchresult?.idlist ??
      [];
    if (ids.length === 0) return [];
    const summaries = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`,
      { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(12_000) },
    );
    if (!summaries.ok) return [];
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
        sourceSlug: "pubmed-central",
      });
    }
    return out;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Open Library
// ---------------------------------------------------------------------------

async function searchOpenLibrary(query: string, limit: number): Promise<DiscoveryCandidate[]> {
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit * 4}`,
      { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(12_000) },
    );
    if (!res.ok) return [];
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
    const allowedPublisherSlugs = ALLOWLIST.filter((s) => s.kind === "publisher").map((s) =>
      s.name.toLowerCase(),
    );
    for (const d of data.docs ?? []) {
      const pub = (d.publisher ?? []).map((p) => p.toLowerCase());
      const matchedPublisher = pub.find((p) =>
        allowedPublisherSlugs.some((a) => p.includes(a) || a.includes(p)),
      );
      if (!matchedPublisher) continue;
      const sourceSlug = ALLOWLIST.find(
        (s) => s.kind === "publisher" && matchedPublisher.includes(s.name.toLowerCase()),
      )?.slug;
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
  } catch {
    return [];
  }
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
