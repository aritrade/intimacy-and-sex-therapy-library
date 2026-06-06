import { z } from "zod";
import { generateObject } from "ai";
import { chatModel, isLlmConfigured } from "@/lib/ai/llm";
import { INSTRUMENTS, type AssessmentCategory } from "@/lib/assessments/instruments";
import { listCatalog, type CatalogItem } from "@/lib/db/queries";

export type IncomingResult = {
  instrumentId: string;
  rawScore: number;
  maxScore: number;
  scoreSuffix?: string;
  severityLabel: string;
  flag: "safe" | "monitor" | "clinician_recommended" | "urgent";
  crisisSignal?: boolean;
};

export type ReflectionRead = { title: string; slug: string; why: string };

export type Reflection = {
  /** Deterministic, validated-band summary — one line per instrument. */
  summary: Array<{ name: string; line: string; flag: IncomingResult["flag"] }>;
  /** AI synthesis (null when no LLM is configured). */
  patterns: string[];
  directions: string[];
  clinicianSuggestion: string | null;
  encouragement: string | null;
  reads: ReflectionRead[];
  crisis: boolean;
  llm: boolean;
};

const DOMAIN_QUERY: Record<AssessmentCategory, string[]> = {
  mood: ["depression", "low mood"],
  anxiety: ["anxiety", "worry"],
  stress: ["stress", "burnout"],
  trauma: ["trauma", "abuse"],
  substance: ["alcohol"],
  wellbeing: ["wellbeing", "self-care"],
  relationship: ["relationship", "communication"],
  sexual: ["desire", "arousal", "intimacy"],
};

const SYNTH_SCHEMA = z.object({
  patterns: z.array(z.string()).max(4),
  directions: z.array(z.string()).max(4),
  clinicianSuggestion: z.string(),
  encouragement: z.string(),
  recommendedReadIndexes: z.array(z.number().int()).max(3),
});

const SYSTEM = `You are a careful, warm psychoeducational guide for an intimacy and sex-therapy library used heavily in India.

You are given a set of validated SELF-ASSESSMENT results (instrument name, score band, severity label). Your job is to write a brief, supportive REFLECTION that helps the person make sense of their results and decide on next steps.

HARD RULES — non-negotiable:
- You are NOT a clinician and this is NOT a diagnosis. Never state or imply the person "has" a disorder. Never assign DSM/ICD labels as conclusions.
- Use hedged, pattern-level language: "your responses suggest…", "many people with this pattern find it helpful to…", "it may be worth exploring…".
- Do not invent scores, cutoffs, or facts. Only reason from the bands you are given.
- Always orient toward professional help and self-compassion. If results are elevated, clearly suggest speaking with a qualified clinician.
- Be inclusive of all identities, orientations, and relationship structures (including asexual and LGBTQ+ people). Never pathologize identity.
- Keep it concise and plain-language. No clinical jargon without a plain gloss.

Return:
- patterns: up to 4 short, hedged observations connecting the results.
- directions: up to 3-4 concrete, evidence-informed next steps (self-guided learning, skills, lifestyle, and professional support).
- clinicianSuggestion: one sentence on what KIND of professional could help (e.g., "a sex therapist", "a psychologist or counsellor", "your GP").
- encouragement: one warm, non-patronizing sentence.
- recommendedReadIndexes: indexes (from the provided READS list) of up to 3 reads most relevant to this person. Use [] if none fit.`;

async function gatherReads(domains: AssessmentCategory[]): Promise<CatalogItem[]> {
  const queries = Array.from(new Set(domains.flatMap((d) => DOMAIN_QUERY[d] ?? [])));
  const bySlug = new Map<string, CatalogItem>();
  for (const q of queries) {
    const found = await listCatalog({ q, limit: 4 }).catch(() => []);
    for (const item of found) if (!bySlug.has(item.slug)) bySlug.set(item.slug, item);
    if (bySlug.size >= 8) break;
  }
  return Array.from(bySlug.values()).slice(0, 8);
}

export async function reflect(results: IncomingResult[]): Promise<Reflection> {
  const valid = results.filter((r) => r.instrumentId in INSTRUMENTS);

  const summary = valid.map((r) => {
    const inst = INSTRUMENTS[r.instrumentId as keyof typeof INSTRUMENTS];
    const score = `${r.rawScore}${r.scoreSuffix ?? ""}/${r.maxScore}${r.scoreSuffix ?? ""}`;
    return {
      name: inst.name,
      line: `${r.severityLabel} (${score})`,
      flag: r.flag,
    };
  });

  const crisis = valid.some((r) => r.crisisSignal || r.flag === "urgent");

  const elevated = valid.filter((r) => r.flag !== "safe");
  const targetDomains = (elevated.length > 0 ? elevated : valid)
    .map((r) => INSTRUMENTS[r.instrumentId as keyof typeof INSTRUMENTS].category)
    .filter((c): c is AssessmentCategory => !!c);
  const reads = await gatherReads(Array.from(new Set(targetDomains)));

  if (!isLlmConfigured() || valid.length === 0) {
    return {
      summary,
      patterns: [],
      directions: [],
      clinicianSuggestion: null,
      encouragement: null,
      reads: reads.slice(0, 3).map((r) => ({ title: r.title, slug: r.slug, why: "" })),
      crisis,
      llm: false,
    };
  }

  const resultsText = valid
    .map((r) => {
      const inst = INSTRUMENTS[r.instrumentId as keyof typeof INSTRUMENTS];
      return `- ${inst.name} (${inst.category}): ${r.severityLabel}, flag=${r.flag}`;
    })
    .join("\n");

  const readsText = reads.length
    ? reads.map((r, i) => `[${i}] ${r.title}${r.summary ? ` — ${r.summary.slice(0, 140)}` : ""}`).join("\n")
    : "(none available)";

  try {
    const { object } = await generateObject({
      model: chatModel(),
      schema: SYNTH_SCHEMA,
      temperature: 0.4,
      maxTokens: 700,
      system: SYSTEM,
      prompt: `RESULTS:\n${resultsText}\n\n${crisis ? "A crisis-signal item was endorsed — be especially gentle and prioritise immediate support resources.\n\n" : ""}READS (choose by index):\n${readsText}`,
    });

    const chosen = object.recommendedReadIndexes
      .filter((i) => i >= 0 && i < reads.length)
      .map((i) => ({ title: reads[i].title, slug: reads[i].slug, why: "" }));
    const finalReads = chosen.length > 0 ? chosen : reads.slice(0, 3).map((r) => ({ title: r.title, slug: r.slug, why: "" }));

    return {
      summary,
      patterns: object.patterns,
      directions: object.directions,
      clinicianSuggestion: object.clinicianSuggestion,
      encouragement: object.encouragement,
      reads: finalReads,
      crisis,
      llm: true,
    };
  } catch {
    return {
      summary,
      patterns: [],
      directions: [],
      clinicianSuggestion: null,
      encouragement: null,
      reads: reads.slice(0, 3).map((r) => ({ title: r.title, slug: r.slug, why: "" })),
      crisis,
      llm: false,
    };
  }
}
