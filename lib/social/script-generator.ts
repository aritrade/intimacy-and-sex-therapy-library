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

export type ScriptStyle =
  /** 9:16 typography reel — original mood-only template. */
  | "typography"
  /** 9:16 reel with stock footage backdrops. */
  | "stock"
  /** 1080x1080 carousel — 5–10 quote slides for IG carousel posts. */
  | "carousel"
  /** 16:9 long-form YouTube essay (3–8 minutes). */
  | "long_form_essay";

export const ScriptSchema = z.object({
  hook: z.string().min(8).max(160).describe("First-line hook, max 160 chars."),
  body: z
    .array(
      z.object({
        text: z.string().min(4).max(600),
        seconds: z.number().min(2).max(60),
      }),
    )
    .min(2)
    .max(20),
  cta: z.string().min(8).max(220).describe("A non-pushy call-to-action."),
  caption: z.string().max(2200).describe("Caption for IG/YT description, with hashtags on a separate line."),
  hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]{2,40}$/u)).min(3).max(15),
  warning: z.string().nullable().describe("Optional safety warning (e.g., crisis resource line)."),
  citationLine: z.string().nullable().describe("If a source was provided, the citation line displayed on screen."),
  durationSeconds: z.number().min(15).max(600),
});

export type GeneratedScript = z.infer<typeof ScriptSchema>;

export type ScriptInput = {
  brief: string;
  language: "en" | "hi" | "hinglish";
  durationSeconds: number;
  style?: ScriptStyle;
  resource?: { title: string; authors?: string[]; year?: number; sourceName: string; url: string };
};

export class ScriptRefusal extends Error {
  constructor(public reason: "crisis_signal" | "refusal_category" | "not_configured") {
    super(reason);
  }
}

const STYLE_GUIDANCE: Record<ScriptStyle, string> = {
  typography: `Style: 9:16 typography reel. Each scene's "text" appears on screen AND is voiced over. Keep each scene under ~12 spoken words per second of screen time. Build 3–6 scenes that sum to roughly the target duration.`,

  stock: `Style: 9:16 stock-footage reel. Each scene's "text" is a single short sentence (≤14 words) overlaid on a B-roll clip. Lead each scene with a concrete, evocative image — the keyword extractor needs at least one strong noun per scene to find good footage (e.g. "morning light through curtains", "two cups of tea", "rain on window"). Build 3–6 scenes.`,

  carousel: `Style: square carousel post (5–10 slides). Each "scene" is one slide. Slides are READ — not voiced. Make each slide stand alone: a complete thought in 1–2 sentences, max ~28 words. Slide 1 (hook) sets up the question. Final slide (cta) tells the reader what to do next. Use "seconds: 2" for every slide; the renderer ignores duration for carousels.`,

  long_form_essay: `Style: 16:9 long-form YouTube essay, 3–8 minutes. Build 6–12 chapters. Each chapter's "text" is a short paragraph (40–90 words) of narration. The first sentence of each chapter must work as an on-screen lower-third caption (≤14 words). Chapters can quote the source resource when one is provided. Reading speed budget: ~150 words/minute, so a 5-minute essay is ~750 words total across all chapter "text" fields combined.`,
};

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

  const targetSeconds = input.durationSeconds;

  const system = `You are a clinician-safe ${style === "long_form_essay" ? "long-form essayist" : "short-form scriptwriter"} for a sex-therapy education library. Your output is NEVER published directly — it goes through clinician + editor review first.

HARD CONSTRAINTS
- ${langInstruction}
- Target duration: ${targetSeconds} seconds (allow ±10%).
- ${STYLE_GUIDANCE[style]}
- LGBTQ+ and asexual-affirming. Gender-neutral by default unless the brief explicitly references a gender.
- Sex-positive. Never pathologise. Never moralise.
- No medical dosing. Ever.
- No clinical diagnoses (use "what people describe" / "many people experience").
- The CTA must NOT push therapy as a one-size-fits-all answer. It can suggest "explore the library", "read more on the page", "talk to a clinician if it persists".
- Hashtags: 3–15 entries, each starting with # and 2–40 letters, no spaces.

REFUSAL — return a hook that explains why you're declining if the brief asks for any of these:
${refusalList}

CITATION RULE
${input.resource
  ? "Include a 1-line on-screen citation (citationLine field) referencing the supplied source."
  : "If you cannot ground a factual claim, return a soft, non-claim-making hook (e.g., 'A reminder, not a remedy:')."}`;

  const prompt = `BRIEF:\n${input.brief}\n${sourceHint}\nReturn JSON matching the schema. Keep all language clear, warm, and judgment-free.`;

  const { object } = await generateObject({
    model: chatModel(),
    system,
    prompt,
    schema: ScriptSchema,
    temperature: 0.5,
  });

  // Belt-and-braces post-check
  const flat = [object.hook, object.cta, object.caption, ...object.body.map((b) => b.text)]
    .join(" ")
    .toLowerCase();
  if (/\b\d+\s?(mg|milligram|mcg|microgram)\b/.test(flat)) {
    throw new ScriptRefusal("refusal_category");
  }

  return { ...object, durationSeconds: targetSeconds };
}
