/**
 * Auto-tagger. Two-stage:
 *
 *   1. Heuristic difficulty from Flesch-Kincaid grade. This is deterministic
 *      and runs offline.
 *
 *   2. Topic + population + modality classification via Claude. Falls back
 *      to a keyword-based classifier when ANTHROPIC_API_KEY is not set or
 *      when the LLM returns an invalid shape.
 *
 * Output is ALWAYS marked human_reviewed=false. A curator must approve via
 * the admin UI before the resource is published.
 */

import { fleschKincaidGrade } from "../reading/flesch-kincaid";
import {
  DIFFICULTY,
  MODALITIES,
  POPULATIONS,
  TOPICS,
  type Difficulty,
  type Modality,
  type Population,
  type Topic,
} from "./topics";

export type TaggerOutput = {
  difficulty: Difficulty;
  topics: Topic[];
  populations: Population[];
  modalities: Modality[];
  reading_grade: number;
  source: "heuristic" | "claude";
  human_reviewed: false;
};

export function difficultyFromGrade(grade: number): Difficulty {
  if (grade <= 10) return "beginner";
  if (grade <= 13) return "intermediate";
  return "advanced";
}

/**
 * Pure-keyword classifier — no network. Used as the offline fallback and as
 * a sanity check on Claude output.
 */
export function keywordClassify(
  title: string,
  body: string,
): { topics: Topic[]; populations: Population[]; modalities: Modality[] } {
  const text = `${title}\n${body}`.toLowerCase();
  const has = (s: string | RegExp) =>
    typeof s === "string" ? text.includes(s) : s.test(text);

  const topicHits = new Set<Topic>();
  if (has("vaginismus")) topicHits.add("vaginismus");
  if (has("dyspareunia")) topicHits.add("dyspareunia");
  if (has(/\berectile\b/) || has(" ed ") || has("erectile dysfunction")) topicHits.add("erectile_dysfunction");
  if (has("premature ejaculation")) topicHits.add("premature_ejaculation");
  if (has("delayed ejaculation")) topicHits.add("delayed_ejaculation");
  if (has("anorgasmia")) topicHits.add("anorgasmia");
  if (has("performance anxiety")) topicHits.add("performance_anxiety");
  if (has("low desire") || has("hypoactive sexual desire") || has("hsdd") || has("fsiad")) topicHits.add("low_desire");
  if (has("desire discrepancy")) topicHits.add("desire_discrepancy");
  if (has("responsive desire") || has("basson")) topicHits.add("willingness");
  if (has("arousal disorder")) topicHits.add("arousal_disorders");
  if (has("compulsive sexual")) topicHits.add("compulsive_sexual_behavior");
  if (has("pornography") || has("porn use")) topicHits.add("porn_related_distress");
  if (has("infidelity")) topicHits.add("infidelity_recovery");
  if (has("couple therapy") || has("couple counselling") || has("couple counseling")) topicHits.add("couple_counselling");
  if (has("attachment")) topicHits.add("attachment_styles");
  if (has("communication")) topicHits.add("communication_breakdown");
  if (has("trauma")) topicHits.add("sexual_trauma");
  if (has("shame")) topicHits.add("religious_shame");
  if (has("body image")) topicHits.add("body_image");
  if (has("polyamor") || has("non-monogam") || has("nonmonogam") || has("ethical non-monogamy") || has("cnm")) {
    topicHits.add("polyamory");
    topicHits.add("open_relationships");
  }
  if (has("situationship")) topicHits.add("situationships");
  if (has("transgender") || has("gender-affirming") || has("gender affirming") || has("gender diverse")) {
    topicHits.add("trans_affirming_care");
    topicHits.add("lgbtq");
  }
  if (has("asexual") || has(/\bace\b/)) topicHits.add("ace_spectrum");
  if (has("demisexual")) topicHits.add("demi");
  if (has("aromantic")) topicHits.add("aromantic");
  if (has("postpartum")) topicHits.add("postpartum");
  if (has("menopause") || has("perimenopause")) topicHits.add("perimenopause");
  if (has("disability")) topicHits.add("disability");
  if (has("autism") || has("autistic")) topicHits.add("autism");
  if (has("adhd")) topicHits.add("adhd");

  const popHits = new Set<Population>();
  if (has("couple") || has("partner")) popHits.add("couples");
  if (has("women") || has("female")) popHits.add("women");
  if (has(/\bmen\b/) || has(/\bmale\b/)) popHits.add("men");
  if (has("lgbt") || has("queer") || has("transgender") || has("lesbian") || has("gay") || has("bisexual"))
    popHits.add("lgbtq");
  if (has("asexual")) popHits.add("ace");
  if (has("transgender") || has("trans ")) popHits.add("trans");
  if (has("india") || has("indian")) popHits.add("india");
  if (has("disability")) popHits.add("disability");
  if (has("older adult") || has("aging")) popHits.add("older_adults");
  if (popHits.size === 0) popHits.add("general");

  const modHits = new Set<Modality>();
  if (has("cognitive behav") || has(" cbt ")) modHits.add("cbt");
  if (has("emotionally focused") || has(" eft ")) modHits.add("eft");
  if (has("gottman")) modHits.add("gottman");
  if (has("sensate focus") || has("masters and johnson") || has("masters & johnson")) modHits.add("sensate_focus");
  if (has("motivational interview")) modHits.add("mi");
  if (has("internal family systems") || has(" ifs ")) modHits.add("ifs");
  if (has("trauma-informed") || has("trauma informed")) modHits.add("trauma_informed");
  if (has("mindfulness")) modHits.add("mindfulness");
  if (has("plissit") || has("ex-plissit")) modHits.add("plissit");
  if (has("dual control") || has("bancroft")) modHits.add("dual_control");
  if (has("responsive desire") || has("basson")) modHits.add("basson_responsive_desire");
  if (has("gender-affirming") || has("gender affirming")) modHits.add("gender_affirming");
  if (modHits.size === 0) modHits.add("psychoeducation");

  return {
    topics: [...topicHits],
    populations: [...popHits],
    modalities: [...modHits],
  };
}

export type TagInputs = {
  title: string;
  abstract?: string;
  body?: string;
};

export async function tagResource(input: TagInputs): Promise<TaggerOutput> {
  const fullText = `${input.title}\n${input.abstract ?? ""}\n${input.body ?? ""}`;
  const grade = fleschKincaidGrade(fullText);
  const difficulty = difficultyFromGrade(grade);

  // Keyword classifier first — always cheap and offline.
  const kw = keywordClassify(input.title, `${input.abstract ?? ""}\n${input.body ?? ""}`);

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      difficulty,
      topics: kw.topics,
      populations: kw.populations,
      modalities: kw.modalities,
      reading_grade: grade,
      source: "heuristic",
      human_reviewed: false,
    };
  }

  // Claude classifier (defensive: if anything fails, fall through to keyword).
  try {
    const out = await classifyWithClaude(input);
    return {
      difficulty,
      topics: validatedFromClaude(out.topics, TOPICS, kw.topics) as Topic[],
      populations: validatedFromClaude(
        out.populations,
        POPULATIONS,
        kw.populations,
      ) as Population[],
      modalities: validatedFromClaude(
        out.modalities,
        MODALITIES,
        kw.modalities,
      ) as Modality[],
      reading_grade: grade,
      source: "claude",
      human_reviewed: false,
    };
  } catch {
    return {
      difficulty,
      topics: kw.topics,
      populations: kw.populations,
      modalities: kw.modalities,
      reading_grade: grade,
      source: "heuristic",
      human_reviewed: false,
    };
  }
}

function validatedFromClaude(
  candidates: string[],
  allowed: Record<string, string>,
  fallback: string[],
): string[] {
  const valid = new Set(Object.keys(allowed));
  const out = candidates.filter((c) => valid.has(c));
  return out.length > 0 ? out : fallback;
}

/**
 * Lazy import so the rest of the module can run in environments that don't
 * have `@ai-sdk/anthropic` installed (e.g., a tiny CI worker).
 */
async function classifyWithClaude(input: TagInputs): Promise<{
  topics: string[];
  populations: string[];
  modalities: string[];
}> {
  const { generateObject } = await import("ai");
  const { anthropic } = await import("@ai-sdk/anthropic");
  const { z } = await import("zod");

  const Schema = z.object({
    topics: z.array(z.string()),
    populations: z.array(z.string()),
    modalities: z.array(z.string()),
  });

  const allowedTopics = Object.keys(TOPICS).join(", ");
  const allowedPops = Object.keys(POPULATIONS).join(", ");
  const allowedMods = Object.keys(MODALITIES).join(", ");

  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-5"),
    schema: Schema,
    temperature: 0,
    system:
      `You are a clinical taxonomist. Classify a sex-therapy resource using ONLY the allowed values for each axis.\n\n` +
      `Allowed topics: ${allowedTopics}\n` +
      `Allowed populations: ${allowedPops}\n` +
      `Allowed modalities: ${allowedMods}\n\n` +
      `Return only values from the allowed lists. No prose.`,
    prompt: `Title: ${input.title}\n\nAbstract: ${input.abstract ?? "(none)"}\n\nBody (first 6000 chars):\n${(input.body ?? "").slice(0, 6000)}`,
  });

  return object;
}
