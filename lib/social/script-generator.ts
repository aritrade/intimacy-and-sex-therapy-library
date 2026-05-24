/**
 * Short-form script generator for Phase 6.
 *
 * Generates 30s / 60s / 90s scripts from a brief + (optional) source resource.
 * Uses Claude with a Zod-validated schema and explicit clinician-safe
 * constraints. The output is NEVER published directly — it always lands as a
 * draft in `content_drafts` (status="script_draft") for clinician review.
 *
 * Constraints enforced by the system prompt AND by post-generation checks:
 *   - No medical dosing.
 *   - No diagnosis or pathologising.
 *   - Sex-positive, LGBTQ+ and asexual-affirming.
 *   - Cite source resource if one is supplied.
 *   - Refuse if the brief itself violates a refusal category.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { claudeModel, isAnthropicConfigured } from "@/lib/ai/anthropic";
import { REFUSAL_CATEGORIES, detectCrisis } from "@/lib/safety/guardrails";

export const ScriptSchema = z.object({
  hook: z.string().min(8).max(160).describe("First-line hook, max 160 chars."),
  body: z
    .array(
      z.object({
        text: z.string().min(4).max(280),
        seconds: z.number().min(2).max(20),
      }),
    )
    .min(2)
    .max(8),
  cta: z.string().min(8).max(180).describe("A non-pushy call-to-action."),
  caption: z.string().max(2200).describe("Caption for IG/YT description, with hashtags on a separate line."),
  hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]{2,40}$/u)).min(3).max(15),
  warning: z.string().nullable().describe("Optional safety warning (e.g., crisis resource line)."),
  citationLine: z.string().nullable().describe("If a source was provided, the citation line displayed on screen."),
  durationSeconds: z.union([z.literal(30), z.literal(60), z.literal(90)]),
});

export type GeneratedScript = z.infer<typeof ScriptSchema>;

export type ScriptInput = {
  brief: string;
  language: "en" | "hi" | "hinglish";
  durationSeconds: 30 | 60 | 90;
  resource?: { title: string; authors?: string[]; year?: number; sourceName: string; url: string };
};

export class ScriptRefusal extends Error {
  constructor(public reason: "crisis_signal" | "refusal_category" | "not_configured") {
    super(reason);
  }
}

export async function generateScript(input: ScriptInput): Promise<GeneratedScript> {
  if (!isAnthropicConfigured()) throw new ScriptRefusal("not_configured");
  if (detectCrisis(input.brief).length > 0) throw new ScriptRefusal("crisis_signal");

  const refusalList = REFUSAL_CATEGORIES.map((c) => `- ${c.replace(/_/g, " ")}`).join("\n");

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
  const expectedScenes = targetSeconds === 30 ? "3 to 4" : targetSeconds === 60 ? "4 to 6" : "6 to 8";

  const system = `You are a clinician-safe short-form scriptwriter for a sex-therapy education library. Your output is NEVER published directly — it goes through clinician + editor review first.

HARD CONSTRAINTS
- ${langInstruction}
- Target duration: ${targetSeconds} seconds. Build ${expectedScenes} scenes that sum to roughly ${targetSeconds}s (allow ±3s).
- Each scene's "text" is what appears on screen AND is voiced over. Keep each scene's "text" under 12 spoken words per second of screen time.
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
    model: claudeModel(),
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
