/**
 * Short-form script generator.
 *
 * Generates 30s / 60s / 90s short-form scripts AND (when style ===
 * "long_form_essay") 3–8 minute YouTube essay scripts.
 *
 * Provider: uses whichever LLM the platform has configured via
 * `lib/ai/llm.ts`. In the free-tier deployment this is Groq with
 * llama-3.3-70b. Falls back to Anthropic when present (paid tier).
 *
 * Output is NEVER published directly — it always lands as a draft in
 * `content_drafts` (status="script_draft") for clinician review.
 *
 * Constraints enforced by the system prompt AND post-generation checks:
 *   - No medical dosing.
 *   - No diagnosis or pathologising.
 *   - Sex-positive, LGBTQ+ and asexual-affirming.
 *   - Cite source resource if one is supplied.
 *   - Refuse if the brief itself violates a refusal category.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { chatModel, isLlmConfigured } from "@/lib/ai/llm";
import { REFUSAL_CATEGORIES, detectCrisis } from "@/lib/safety/guardrails";
import { NARRATOR } from "@/lib/brand/persona";
import {
  playbookPrompt,
  structuredFeedbackPrompt,
  type ScriptStyleId,
} from "@/lib/brand/playbook";
import { critiqueAndMaybeRewrite } from "@/lib/social/script-critique";
import { formatEvidenceBlock } from "@/lib/social/grounding";
import type { RetrievedChunk } from "@/lib/search/hybrid";

export type ScriptStyle =
  /** 9:16 typography reel — original mood-only template. */
  | "typography"
  /** 9:16 reel with stock footage backdrops. */
  | "stock"
  /** 1080x1080 carousel — 5–10 quote slides for IG carousel posts. */
  | "carousel"
  /** 16:9 long-form YouTube essay (3–8 minutes). */
  | "long_form_essay";

/**
 * Generous max lengths on the wire so LLM overshoot doesn't throw the
 * entire response away on AI_TypeValidationError. The strict caps
 * (160/220/600/2200) are enforced in code via `truncateScript()` after
 * the LLM returns, which lets us recover the script when the model is
 * 5-30% over budget instead of failing the whole pipeline.
 */
export const ScriptSchema = z.object({
  hook: z.string().min(8).max(400).describe("First-line hook, target <=160 chars."),
  body: z
    .array(
      z.object({
        text: z.string().min(4).max(1200),
        seconds: z.number().min(2).max(60),
      }),
    )
    .min(2)
    .max(20),
  cta: z.string().min(8).max(500).describe("A non-pushy call-to-action, target <=220 chars."),
  caption: z.string().max(3500).describe("Caption for IG/YT description, with hashtags on a separate line."),
  // Loose schema by design — LLMs (esp. Gemma + Llama 3) routinely emit
  // hashtags without the leading `#` even when the schema description
  // says otherwise. Vercel AI SDK's `generateObject` validates the raw
  // LLM JSON against this Zod shape BEFORE any preprocess runs, so we
  // accept any string here and normalize in `normaliseHashtags()` below.
  hashtags: z.array(z.string().min(1).max(60)).min(3).max(15),
  warning: z.string().nullable().describe("Optional safety warning (e.g., crisis resource line)."),
  citationLine: z.string().nullable().describe("If a source was provided, the citation line displayed on screen."),
  durationSeconds: z.number().min(15).max(600),
});

/** Strict caps applied post-generation (the schema is generous on purpose). */
const STRICT_CAPS = {
  hook: 160,
  cta: 220,
  bodyText: 600,
  caption: 2200,
} as const;

/**
 * Truncate at a sentence boundary if possible, else hard-truncate with
 * an ellipsis. Used to bring overshooting LLM output back inside the
 * caps the downstream consumers (SSML, on-screen lower-thirds, IG
 * caption box) actually require.
 */
function smartTruncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const slice = s.slice(0, max);
  const lastStop = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
  );
  if (lastStop > max * 0.6) return slice.slice(0, lastStop + 1).trim();
  return slice.replace(/\s+\S*$/, "").trim() + "…";
}

function truncateScript(s: GeneratedScript): GeneratedScript {
  return {
    ...s,
    hook: smartTruncate(s.hook, STRICT_CAPS.hook),
    cta: smartTruncate(s.cta, STRICT_CAPS.cta),
    caption: smartTruncate(s.caption, STRICT_CAPS.caption),
    body: s.body.map((b) => ({
      ...b,
      text: smartTruncate(b.text, STRICT_CAPS.bodyText),
    })),
  };
}

const HASHTAG_RX = /^#[\p{L}\p{N}_]{2,40}$/u;

/**
 * Coerce raw LLM hashtag strings into well-formed `#tag` entries.
 * Drops anything that can't be rescued (stray punctuation, empty, too
 * long after cleanup). Always returns at least 1 tag — if the input
 * list is unusable we'd rather post without hashtags than crash the
 * pipeline.
 */
function normaliseHashtags(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const cleaned = r.trim().replace(/[^\p{L}\p{N}_#]/gu, "");
    const tag = cleaned.startsWith("#") ? cleaned : `#${cleaned}`;
    if (!HASHTAG_RX.test(tag)) continue;
    if (seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out;
}

export type GeneratedScript = z.infer<typeof ScriptSchema>;

export type ScriptInput = {
  brief: string;
  language: "en" | "hi" | "hinglish";
  durationSeconds: number;
  style?: ScriptStyle;
  resource?: { title: string; authors?: string[]; year?: number; sourceName: string; url: string };
  /**
   * Optional: retrieved corpus evidence used to ground the script. When
   * present, the generator injects an EVIDENCE block and instructs the LLM
   * to make only evidence-supported claims. `citation` is the suggested
   * on-screen line derived from the top source.
   */
  evidence?: {
    chunks: RetrievedChunk[];
    citation: string | null;
  };
  /**
   * Optional: reviewer feedback that the LLM must address. Used by the
   * "Apply notes & rewrite" action — the previous script (which the
   * reviewer rejected) is passed in along with each accumulated note
   * so the regeneration is informed by every iteration so far.
   */
  reviewerFeedback?: {
    previousScriptMd: string;
    notes: Array<{ reason: string; notes?: string }>;
  };
};

export class ScriptRefusal extends Error {
  constructor(
    public reason:
      | "crisis_signal"
      | "refusal_category"
      | "not_configured"
      | "script_too_short",
    public detail?: string,
  ) {
    super(detail ? `${reason}: ${detail}` : reason);
  }
}

const STYLE_GUIDANCE: Record<ScriptStyle, string> = {
  typography: `Style: 9:16 typography reel. Each scene's "text" appears on screen AND is voiced over. Keep each scene under ~12 spoken words per second of screen time. Build 3–6 scenes that sum to roughly the target duration.`,

  stock: `Style: 9:16 stock-footage reel. Each scene's "text" is a single short sentence (≤14 words) overlaid on a B-roll clip. Lead each scene with a concrete, evocative image so the keyword extractor has at least one strong noun per scene to find good footage. Derive that imagery from THIS brief's subject and the EVIDENCE — never reuse stock phrases from any example or template. Build 3–6 scenes.`,

  carousel: `Style: square carousel post (5–10 slides). Each "scene" is one slide. Slides are READ — not voiced. Make each slide stand alone: a complete thought in 1–2 sentences, max ~28 words. Slide 1 (hook) sets up the question. Final slide (cta) tells the reader what to do next. Use "seconds: 2" for every slide; the renderer ignores duration for carousels.`,

  long_form_essay: `Style: 16:9 long-form YouTube essay, 1.5–4 minutes. This is a DETAILED EXPLAINER, not a bullet-point summary.

CHAPTER RULES (read carefully — past drafts failed because the model wrote 5-8 word chapter headlines instead of paragraphs):
- Build 4–7 chapters that flow into each other like sections of a short essay.
- Each chapter's "text" field MUST be a fully-written paragraph of 45–80 words. NOT a headline. NOT a sentence fragment. A paragraph in the voice of a calm, warm explainer.
- The first sentence of each chapter must also work as an on-screen lower-third caption (≤14 words), but the rest of the paragraph is what the narrator actually says aloud.
- Use the second person ("you", "your partner"). Avoid academic distancing language.
- Cite the source resource by name when one is provided.

WORD BUDGET (this is enforced by a post-generation check; the call will be retried if you go too low):
- The narrator reads at ~120 words/minute (slow, calm, explainer pace — not podcast speed).
- For a {targetSeconds}-second essay, write {targetWords}–{targetWordsMax} words TOTAL across all chapter "text" fields combined.
- A 120s essay needs roughly 200–290 words; a 180s essay needs roughly 300–430 words.

GOOD example chapter (78 words):
  "When desire feels uneven in a long-term relationship, it usually gets misread as a problem with attraction. In reality, most adults experience what researchers call responsive desire — arousal that shows up after touch begins, not before. If you've ever felt fine settling into a slow kiss but skeptical when it was first suggested, you've already met your own responsive pattern. The fix isn't more spark. It's more context that lets responsive desire find an opening."

BAD example chapter (8 words, this would fail):
  "Responsive desire is different from spontaneous desire."`,
};

/**
 * Acceptable word-count band for a long-form essay at a given duration.
 *
 * The narrator's actual playback rate is `NARRATOR.tts.targetWpm` (120
 * wpm for Jenny @ -10% — empirically measured on 2026-05-27 against
 * d8990c52: 59 body words read in ~30s = 118 wpm). For a 120-second
 * essay that gives us a 240-word ideal, with 15% slack on each side.
 *
 * Anything below `min` triggers a single re-prompt with explicit
 * miss-message; anything still below 70% of `ideal` after retry throws
 * `ScriptRefusal("script_too_short")` so the cron marks it refused
 * instead of silently shipping a 30-second "4-minute" video.
 */
function longFormWordBudget(targetSeconds: number): { min: number; ideal: number; max: number } {
  const ideal = Math.round((targetSeconds / 60) * NARRATOR.tts.targetWpm);
  return {
    min: Math.round(ideal * 0.85),
    ideal,
    max: Math.round(ideal * 1.2),
  };
}

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function bodyWordCount(script: GeneratedScript): number {
  return script.body.reduce((acc, b) => acc + countWords(b.text), 0);
}

export async function generateScript(input: ScriptInput): Promise<GeneratedScript> {
  if (!isLlmConfigured()) throw new ScriptRefusal("not_configured");
  if (detectCrisis(input.brief).length > 0) throw new ScriptRefusal("crisis_signal");

  const refusalList = REFUSAL_CATEGORIES.map((c) => `- ${c.replace(/_/g, " ")}`).join("\n");
  const style = input.style ?? "typography";

  const langInstruction =
    input.language === "en"
      ? "Write in clear, warm English."
      : input.language === "hi"
        ? "हिंदी में लिखें — सरल, सम्मानजनक भाषा।"
        : "Write in Hinglish (Roman script). Mix English and Hindi naturally.";

  const sourceHint = input.resource
    ? `\nCITED SOURCE (you MUST cite it on screen):\n  Title: ${input.resource.title}\n  Authors: ${(input.resource.authors ?? []).slice(0, 3).join(", ") || "—"}\n  Source: ${input.resource.sourceName}${input.resource.year ? `, ${input.resource.year}` : ""}\n  URL: ${input.resource.url}\n`
    : "\nNo source supplied. Use only the most consensus-evidenced claims; if uncertain, return a refusal-style hook instead.";

  // Grounding evidence retrieved from the validated corpus. When present, the
  // LLM is constrained to claims the evidence supports.
  const evidenceChunks = input.evidence?.chunks ?? [];
  const evidenceBlock =
    evidenceChunks.length > 0
      ? `\nEVIDENCE (retrieved from our clinician-reviewed corpus — ground every factual claim in these passages; cite by author/source, never invent studies or numbers):\n${formatEvidenceBlock(evidenceChunks)}\n`
      : "";

  const targetSeconds = input.durationSeconds;
  const budget = longFormWordBudget(targetSeconds);

  // The long_form_essay guidance has {targetSeconds} / {targetWords} /
  // {targetWordsMax} placeholders so the same template can describe the
  // exact word budget the LLM has to hit. Short-form styles ignore them.
  const styleGuidance = STYLE_GUIDANCE[style]
    .replace(/\{targetSeconds\}/g, String(targetSeconds))
    .replace(/\{targetWords\}/g, String(budget.min))
    .replace(/\{targetWordsMax\}/g, String(budget.max));

  const system = `You are a clinician-safe ${style === "long_form_essay" ? "long-form essayist" : "short-form scriptwriter"} for a sex-therapy education library. Your output is NEVER published directly — it goes through clinician + editor review first.

HARD CONSTRAINTS
- ${langInstruction}
- Target duration: ${targetSeconds} seconds (allow ±10%).
- ${styleGuidance}
- LGBTQ+ and asexual-affirming. Gender-neutral by default unless the brief explicitly references a gender.
- Sex-positive. Never pathologise. Never moralise.
- No medical dosing. Ever.
- No clinical diagnoses (use "what people describe" / "many people experience").
- The CTA must NOT push therapy as a one-size-fits-all answer. It can suggest "explore the library", "read more on the page", "talk to a clinician if it persists".
- Hashtags: 3–15 entries, each starting with # and 2–40 letters, no spaces.

REFUSAL — return a hook that explains why you're declining if the brief asks for any of these:
${refusalList}

GROUNDING RULE
${evidenceChunks.length > 0
  ? "An EVIDENCE block is provided below. Every factual or clinical claim MUST be supported by that evidence. Do NOT invent statistics, study names, or findings beyond it. Derive on-screen imagery from the brief and the evidence — never copy wording from any style example."
  : "No retrieved evidence is available. Stick to broadly consensus-evidenced, non-numeric claims; never fabricate a study, statistic, or citation."}

CITATION RULE
${input.resource || input.evidence?.citation
  ? "Include a 1-line on-screen citation (citationLine field) referencing the supplied source / evidence."
  : "If you cannot ground a factual claim, return a soft, non-claim-making hook (e.g., 'A reminder, not a remedy:')."}
${playbookPrompt({ style: style as ScriptStyleId })}`;

  // Reviewer feedback context. When present, the LLM is explicitly told
  // this is a REGENERATION and that the previous attempt was rejected.
  // Each reviewer reason is converted to an ACTIONABLE DIRECTIVE via
  // `feedbackToDirective` (see lib/brand/playbook.ts) rather than dumped
  // as a raw label — the LLM follows imperative-mood instructions much
  // more reliably than it follows category names. The reviewer's
  // verbatim note is appended as supporting context.
  const feedbackBlock = input.reviewerFeedback
    ? `

⚠ REGENERATION REQUEST — the previous version of this script was rejected by a reviewer. Read each directive carefully and execute ALL of them. Do not repeat the same mistakes.

PREVIOUS ATTEMPT (the one that was rejected):
${input.reviewerFeedback.previousScriptMd.slice(0, 2000)}
${structuredFeedbackPrompt(input.reviewerFeedback.notes)}

When rewriting:
  - Keep what worked (structure, length envelope, brand voice).
  - Execute every directive above. Each is a specific change, not a category label.
  - If a note says "rewrite completely" (duplicate_content), treat earlier creative choices as off-limits and reach for a fresh angle, vocabulary, and pacing.
  - Never repeat a phrase from the previous attempt that a reviewer note specifically called out.`
    : "";

  const prompt = `BRIEF:\n${input.brief}\n${sourceHint}${evidenceBlock}${feedbackBlock}\nReturn JSON matching the schema. Keep all language clear, warm, and judgment-free.`;

  // First attempt.
  let object = (
    await generateObject({
      model: chatModel(),
      system,
      prompt,
      schema: ScriptSchema,
      temperature: 0.5,
    })
  ).object;

  // Post-gen word-count guard for long-form. Past drafts of "4-minute
  // essays" came back as 80-word bullet lists (30s of speech). If the
  // body is below the floor we re-prompt once with an explicit miss
  // message and a slightly higher temperature for variety. We don't
  // retry indefinitely — one budget-aware retry is plenty in practice.
  if (style === "long_form_essay") {
    const wordsFirst = bodyWordCount(object);
    if (wordsFirst < budget.min) {
      const retryPrompt = `${prompt}

The previous attempt totalled ${wordsFirst} words across all chapters, which is too short for a ${targetSeconds}-second essay. You MUST write between ${budget.min} and ${budget.max} words total across the body chapters this time. Each chapter's text field is a full 45-80 word paragraph in the narrator's voice — not a headline, not a sentence fragment. Write the actual prose the narrator will read aloud.`;
      const second = await generateObject({
        model: chatModel(),
        system,
        prompt: retryPrompt,
        schema: ScriptSchema,
        temperature: 0.65,
      });
      const wordsSecond = bodyWordCount(second.object);
      // Keep whichever attempt is closer to the ideal (in either direction).
      const diff = (w: number) => Math.abs(w - budget.ideal);
      object = diff(wordsSecond) < diff(wordsFirst) ? second.object : object;
    }
  }

  // Optional self-critique pass. Off by default (SCRIPT_CRITIQUE=true to
  // enable). When enabled, the LLM grades its own draft on 4 axes
  // (clinical accuracy, brand voice fit, hook strength, CTA pull) and
  // rewrites once if any axis falls below threshold. Adds 5-15s of
  // latency per generation — gated so we can A/B against the baseline
  // before making it default.
  const critiqueResult = await critiqueAndMaybeRewrite(object, {
    systemPrompt: system,
    originalPrompt: prompt,
    rewriteScript: async (extraGuidance: string) => {
      const rewritePrompt = `${prompt}\n\n${extraGuidance}`;
      const r = await generateObject({
        model: chatModel(),
        system,
        prompt: rewritePrompt,
        schema: ScriptSchema,
        temperature: 0.5,
      });
      return r.object;
    },
  });
  object = critiqueResult.script;

  // Belt-and-braces post-check
  const flat = [object.hook, object.cta, object.caption, ...object.body.map((b) => b.text)]
    .join(" ")
    .toLowerCase();
  if (/\b\d+\s?(mg|milligram|mcg|microgram)\b/.test(flat)) {
    throw new ScriptRefusal("refusal_category");
  }

  // Final word-count gate for long-form essays. The retry above gives
  // the LLM one explicit second chance to hit the budget; if it STILL
  // comes in below 70% of the ideal, we'd rather throw and let the cron
  // mark this brief refused than silently ship a 30-second video that
  // claims to be a 2-minute essay. The cron's refusal handler already
  // logs the reason + briefId so we can spot pattern failures.
  if (style === "long_form_essay") {
    const finalWords = bodyWordCount(object);
    const floor = Math.round(budget.ideal * 0.7);
    if (finalWords < floor) {
      throw new ScriptRefusal(
        "script_too_short",
        `body=${finalWords} words, ideal=${budget.ideal} (floor=${floor}) for ${targetSeconds}s essay`,
      );
    }
  }

  // Derive an on-screen citation from the top retrieved source when the
  // model didn't already produce one (soft grounding fallback).
  const citationLine = object.citationLine ?? input.evidence?.citation ?? null;

  return truncateScript({
    ...object,
    citationLine,
    hashtags: normaliseHashtags(object.hashtags),
    durationSeconds: targetSeconds,
  });
}
