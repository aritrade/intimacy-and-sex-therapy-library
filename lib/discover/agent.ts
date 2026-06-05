/**
 * Library "Discover" agent.
 *
 * Given a free-text topic, it gathers REAL candidates from:
 *   - our own corpus (hybridRetrieve: pgvector + bm25), and
 *   - live scholarly / web sources (Europe PMC, OpenAlex, Open Library, Tavily),
 * dedupes them, then asks the LLM to synthesize a structured, CITED Topic Brief
 * plus a ranked reading list.
 *
 * No fabrication: every factual field (title, url, authors, year) is joined
 * from a real candidate by its stable `ref`; the model may only write prose,
 * select/order refs, and cite them by ref. Fabricated refs are dropped. When no
 * LLM is configured (or it errors), a deterministic non-synthesized brief is
 * returned so Discover always works.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { chatModel, isLlmConfigured } from "@/lib/ai/llm";
import { hybridRetrieve } from "@/lib/search/hybrid";
import {
  canonicalUrl,
  fetchEuropePmcCandidates,
  fetchOpenAlexCandidates,
  fetchOpenLibraryCandidates,
  fetchWebCandidates,
  type Candidate,
} from "./sources";

const MAX_CANDIDATES = 24;

export type TopicBrief = {
  summary: string;
  whatResearchSays: { point: string; refs: string[] }[];
  mythsVsFacts: { myth: string; fact: string }[];
  whatYouCanTry: string[];
  whenToSeekHelp: string;
  inclusivityNote: string;
  readingList: { ref: string; why: string }[];
};

export type DiscoverResult = {
  query: string;
  brief: TopicBrief;
  sources: Candidate[];
  llm: boolean;
  /** Europe PMC OA candidates eligible for the ingest flywheel. */
  ingestable: Candidate[];
};

const BriefSchema = z.object({
  summary: z.string().max(1100),
  whatResearchSays: z
    .array(z.object({ point: z.string().max(420), refs: z.array(z.string()).max(4) }))
    .max(6),
  mythsVsFacts: z
    .array(z.object({ myth: z.string().max(220), fact: z.string().max(340) }))
    .max(5),
  whatYouCanTry: z.array(z.string().max(260)).max(6),
  whenToSeekHelp: z.string().max(560),
  inclusivityNote: z.string().max(420),
  readingList: z.array(z.object({ ref: z.string(), why: z.string().max(220) })).max(14),
});

const SYSTEM = `You are the librarian for an evidence-based intimacy & sex-therapy library for adults (India-aware, globally inclusive). You write a warm, accurate Topic Brief grounded ONLY in the provided candidate sources.

HARD RULES
- Use ONLY the provided candidates, each identified by a stable "ref". Cite claims with their ref(s). NEVER invent sources, refs, statistics, or findings.
- If the evidence is thin, say so plainly and write fewer points rather than inventing.
- Inclusivity is mandatory and affirming: cover asexual/ace-spectrum, aromantic, demisexual, LGBTQ+, transgender, non-binary, intersex, queer, polyamory/ENM, kink-aware, and disability perspectives where relevant. Never pathologise or moralise any orientation, identity, or relationship structure.
- Safety: no medical dosing or directive medical instructions. In "when to seek help", encourage professional/clinical support and (gently) crisis support if distress is severe — do not provide crisis instructions yourself.
- Tone: plain language, non-judgemental, hopeful, practical.

OUTPUT
- summary: 2–4 sentences on what the topic is.
- whatResearchSays: up to 6 evidence points, each with the ref(s) it draws from.
- mythsVsFacts: common myths paired with what's actually supported.
- whatYouCanTry: gentle, general, non-clinical suggestions (psychoeducation only).
- whenToSeekHelp: when to consider a qualified clinician/therapist.
- inclusivityNote: one short paragraph affirming diverse identities/structures for this topic.
- readingList: order the most useful candidate refs with a one-line why each.`;

/** Build corpus candidates from our own indexed chunks. */
async function corpusCandidates(query: string): Promise<Candidate[]> {
  const chunks = await hybridRetrieve({ query, topK: 10 });
  const byResource = new Map<string, Candidate>();
  for (const c of chunks) {
    if (byResource.has(c.resourceId)) continue;
    byResource.set(c.resourceId, {
      ref: `lib_${c.resourceId.slice(0, 8)}`,
      kind: "corpus",
      title: c.resourceTitle,
      url: c.externalUrl,
      authors: c.authors,
      year: c.publishedYear,
      snippet: c.content.slice(0, 600),
      source: c.sourceName,
      openAccess: true,
      inLibrary: true,
      resourceId: c.resourceId,
    });
  }
  return [...byResource.values()];
}

/** Gather + dedupe candidates across all sources (priority order preserved). */
async function gatherCandidates(query: string): Promise<Candidate[]> {
  const [corpus, pmc, openalex, books, web] = await Promise.all([
    corpusCandidates(query).catch(() => []),
    fetchEuropePmcCandidates(query, 6),
    fetchOpenAlexCandidates(query, 6),
    fetchOpenLibraryCandidates(query, 3),
    fetchWebCandidates(query, 5),
  ]);

  const seen = new Set<string>();
  const out: Candidate[] = [];
  // Priority: our library first, then OA articles, scholarly, books, web.
  for (const group of [corpus, pmc, openalex, books, web]) {
    for (const c of group) {
      const key = canonicalUrl(c.url);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
      if (out.length >= MAX_CANDIDATES) return out;
    }
  }
  return out;
}

function deterministicBrief(query: string, sources: Candidate[]): TopicBrief {
  return {
    summary: `Here are vetted, evidence-aligned readings on “${query}”, drawn from our library and open scholarly sources. (An AI summary isn't available right now — the sources below are real and curated.)`,
    whatResearchSays: [],
    mythsVsFacts: [],
    whatYouCanTry: [],
    whenToSeekHelp:
      "If this topic is causing you or your relationship significant or persistent distress, consider speaking with a qualified sex therapist or mental-health professional.",
    inclusivityNote:
      "These resources are selected to be affirming of every orientation, gender identity, relationship structure, and ability.",
    readingList: sources.slice(0, 12).map((s) => ({ ref: s.ref, why: s.snippet.slice(0, 160) })),
  };
}

export async function discover(query: string): Promise<DiscoverResult> {
  const q = query.trim();
  const sources = await gatherCandidates(q);
  const ingestable = sources.filter((s) => s.kind === "article" && s.openAccess && s.pmcHit);

  if (sources.length === 0) {
    return { query: q, brief: deterministicBrief(q, sources), sources, llm: false, ingestable };
  }

  if (!isLlmConfigured()) {
    return { query: q, brief: deterministicBrief(q, sources), sources, llm: false, ingestable };
  }

  const refSet = new Set(sources.map((s) => s.ref));
  const candidateList = sources.map((s) => ({
    ref: s.ref,
    kind: s.kind,
    title: s.title,
    year: s.year,
    authors: s.authors.slice(0, 4),
    inLibrary: s.inLibrary,
    snippet: s.snippet.slice(0, 500),
  }));

  try {
    const { object } = await generateObject({
      model: chatModel(),
      system: SYSTEM,
      prompt: `TOPIC: ${q}\n\nCANDIDATES (use only these refs; cite by ref):\n${JSON.stringify(candidateList, null, 1)}\n\nWrite the Topic Brief.`,
      schema: BriefSchema,
      temperature: 0.3,
    });

    // Drop any fabricated refs the model may have emitted.
    const brief: TopicBrief = {
      summary: object.summary,
      whatResearchSays: object.whatResearchSays
        .map((p) => ({ point: p.point, refs: p.refs.filter((r) => refSet.has(r)) }))
        .filter((p) => p.point.trim().length > 0),
      mythsVsFacts: object.mythsVsFacts,
      whatYouCanTry: object.whatYouCanTry,
      whenToSeekHelp: object.whenToSeekHelp,
      inclusivityNote: object.inclusivityNote,
      readingList: object.readingList.filter((r) => refSet.has(r.ref)),
    };

    // Ensure the reading list is never empty: append any uncited sources.
    if (brief.readingList.length === 0) {
      brief.readingList = sources.slice(0, 12).map((s) => ({ ref: s.ref, why: "" }));
    } else {
      const inList = new Set(brief.readingList.map((r) => r.ref));
      for (const s of sources) {
        if (brief.readingList.length >= 14) break;
        if (!inList.has(s.ref)) brief.readingList.push({ ref: s.ref, why: "" });
      }
    }

    return { query: q, brief, sources, llm: true, ingestable };
  } catch {
    return { query: q, brief: deterministicBrief(q, sources), sources, llm: false, ingestable };
  }
}
