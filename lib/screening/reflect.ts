import { z } from "zod";
import { generateObject } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { chatModel, isLlmConfigured } from "@/lib/ai/llm";
import { INSTRUMENTS, type AssessmentCategory } from "@/lib/assessments/instruments";
import { scoreMeta } from "@/lib/assessments/score-meta";
import { listCatalog, type CatalogItem } from "@/lib/db/queries";
import { db } from "@/lib/db/client";
import { assessmentResults } from "@/lib/db/schema";

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
- If a result includes a trend (change since last time), you may gently acknowledge progress or persistence in 'patterns' — without overstating a single data point.

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

type Trend = { previous: number; delta: number; betterWhenHigher: boolean; suffix: string };

async function loadTrends(userId: string, valid: IncomingResult[]): Promise<Map<string, Trend>> {
  const out = new Map<string, Trend>();
  if (!process.env.DATABASE_URL) return out;
  for (const r of valid) {
    const rows = await db
      .select({ rawScore: assessmentResults.rawScore })
      .from(assessmentResults)
      .where(and(eq(assessmentResults.userId, userId), eq(assessmentResults.instrumentId, r.instrumentId)))
      .orderBy(desc(assessmentResults.takenAt))
      .limit(5)
      .catch(() => []);
    if (rows.length === 0) continue;
    // The newest row is likely this very result (just synced); use the next.
    const prev = rows[0].rawScore === r.rawScore ? rows[1] : rows[0];
    if (!prev) continue;
    const meta = scoreMeta(r.instrumentId);
    out.set(r.instrumentId, {
      previous: prev.rawScore,
      delta: r.rawScore - prev.rawScore,
      betterWhenHigher: meta?.betterWhenHigher ?? true,
      suffix: meta?.suffix ?? "",
    });
  }
  return out;
}

function trendClause(t: Trend): string {
  if (t.delta === 0) return "unchanged from last time";
  const improving = (t.delta < 0 && !t.betterWhenHigher) || (t.delta > 0 && t.betterWhenHigher);
  const arrow = t.delta > 0 ? "up" : "down";
  return `${arrow} from ${t.previous}${t.suffix} last time (${improving ? "improving" : "worth watching"})`;
}

export async function reflect(
  results: IncomingResult[],
  opts: { userId?: string } = {},
): Promise<Reflection> {
  const valid = results.filter((r) => r.instrumentId in INSTRUMENTS);

  const trends = opts.userId ? await loadTrends(opts.userId, valid) : new Map<string, Trend>();

  const summary = valid.map((r) => {
    const inst = INSTRUMENTS[r.instrumentId as keyof typeof INSTRUMENTS];
    const score = `${r.rawScore}${r.scoreSuffix ?? ""}/${r.maxScore}${r.scoreSuffix ?? ""}`;
    const trend = trends.get(r.instrumentId);
    return {
      name: inst.name,
      line: `${r.severityLabel} (${score})${trend ? ` — ${trendClause(trend)}` : ""}`,
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
      const trend = trends.get(r.instrumentId);
      return `- ${inst.name} (${inst.category}): ${r.severityLabel}, flag=${r.flag}${trend ? `, trend=${trendClause(trend)}` : ""}`;
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
