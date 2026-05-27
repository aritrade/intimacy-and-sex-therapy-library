/**
 * Optional second-pass self-critique for generated scripts.
 *
 * Asks the same LLM to grade its own draft on four axes (clinical
 * accuracy, brand voice fit, hook strength, CTA pull) on a 0-10 scale.
 * If any axis is below the configured threshold, it rewrites the
 * script ONCE with explicit guidance on which axes need work.
 *
 * The critique pass is OPT-IN via `SCRIPT_CRITIQUE=true` because:
 *   1. It adds 5-15s of latency per generation (Groq).
 *   2. Lower-quality models occasionally over-grade themselves and
 *      then over-rewrite. We want to A/B against the baseline before
 *      making it default.
 *
 * Tuning knobs (env):
 *   - SCRIPT_CRITIQUE=true                  enable critique pass
 *   - SCRIPT_CRITIQUE_THRESHOLD=7           min acceptable axis score
 *   - SCRIPT_CRITIQUE_MAX_REWRITES=1        max rewrite loops (1 = safe)
 *
 * The critique itself is structured (Zod) so we can audit-log the
 * scores and watch trends over time.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { chatModel } from "@/lib/ai/llm";
import type { GeneratedScript } from "@/lib/social/script-generator";

const CritiqueSchema = z.object({
  clinical_accuracy: z.number().min(0).max(10).describe(
    "How well the script grounds claims in evidence and uses required hedges. 10 = every claim is sourced or hedged; 0 = unsupported diagnostic claims.",
  ),
  brand_voice_fit: z.number().min(0).max(10).describe(
    "How well the script matches the late-night radio host persona. 10 = sounds like the brand; 0 = generic textbook prose.",
  ),
  hook_strength: z.number().min(0).max(10).describe(
    "Whether the hook makes a viewer stop scrolling. 10 = unmissable opener; 0 = throat-clearing intro.",
  ),
  cta_pull: z.number().min(0).max(10).describe(
    "Whether the CTA invites action without pushing. 10 = soft, specific, on-brand; 0 = generic 'follow for more'.",
  ),
  notes: z.string().min(8).max(800).describe(
    "Concrete, specific notes on what to fix if any score is below threshold. Reference exact phrases from the script.",
  ),
});

export type Critique = z.infer<typeof CritiqueSchema>;

function isCritiqueEnabled(): boolean {
  return (process.env.SCRIPT_CRITIQUE ?? "").toLowerCase() === "true";
}

function critiqueThreshold(): number {
  const t = Number(process.env.SCRIPT_CRITIQUE_THRESHOLD ?? "7");
  return Number.isFinite(t) && t >= 0 && t <= 10 ? t : 7;
}

function maxRewrites(): number {
  const m = Number(process.env.SCRIPT_CRITIQUE_MAX_REWRITES ?? "1");
  return Number.isFinite(m) && m >= 0 && m <= 3 ? m : 1;
}

function scriptToReviewableMd(s: GeneratedScript): string {
  return [
    `HOOK: ${s.hook}`,
    "",
    "BODY:",
    s.body.map((b, i) => `  ${i + 1}. (${b.seconds}s) ${b.text}`).join("\n"),
    "",
    `CTA: ${s.cta}`,
    "",
    `CITATION: ${s.citationLine ?? "(none)"}`,
  ].join("\n");
}

function failingAxes(c: Critique, threshold: number): string[] {
  const failing: string[] = [];
  if (c.clinical_accuracy < threshold) failing.push("clinical_accuracy");
  if (c.brand_voice_fit < threshold) failing.push("brand_voice_fit");
  if (c.hook_strength < threshold) failing.push("hook_strength");
  if (c.cta_pull < threshold) failing.push("cta_pull");
  return failing;
}

/**
 * Grade `script` against the four axes. Returns the critique object.
 * Does NOT mutate the script. Callers decide whether to rewrite.
 */
export async function critiqueScript(
  script: GeneratedScript,
  systemPrompt: string,
): Promise<Critique> {
  const critiquePrompt = `You wrote the following script for the sex-therapy education library. Now grade it harshly on the four axes below. Be specific in your notes — reference exact phrases. Score each axis 0-10; reserve 9-10 for genuinely excellent work.

SCRIPT TO GRADE:
${scriptToReviewableMd(script)}

Return JSON matching the schema. The "notes" field will be used to rewrite the script if any axis is below ${critiqueThreshold()}, so make the notes ACTIONABLE.`;

  const { object } = await generateObject({
    model: chatModel(),
    system: `${systemPrompt}\n\nYou are now the REVIEWER, not the writer. Apply every rule in the PLAYBOOK block as a grading rubric.`,
    prompt: critiquePrompt,
    schema: CritiqueSchema,
    temperature: 0.2,
  });
  return object;
}

/**
 * Run the critique pass (no-op if `SCRIPT_CRITIQUE` is not enabled).
 * If any axis falls below threshold, rewrite ONCE with the critique
 * notes as guidance, then return the new script. If still failing,
 * return whichever scored better overall (sum of axes).
 *
 * Returns `{ script, critiques }` so the caller can audit-log the
 * scores from both passes.
 */
export async function critiqueAndMaybeRewrite(
  script: GeneratedScript,
  ctx: {
    systemPrompt: string;
    originalPrompt: string;
    rewriteScript: (extraGuidance: string) => Promise<GeneratedScript>;
  },
): Promise<{ script: GeneratedScript; critiques: Critique[] }> {
  if (!isCritiqueEnabled()) {
    return { script, critiques: [] };
  }

  const critiques: Critique[] = [];
  let current = script;
  const threshold = critiqueThreshold();
  const maxLoops = maxRewrites();

  for (let i = 0; i <= maxLoops; i++) {
    const critique = await critiqueScript(current, ctx.systemPrompt);
    critiques.push(critique);
    const failing = failingAxes(critique, threshold);
    if (failing.length === 0) break;
    if (i === maxLoops) break;

    // Rewrite with critique notes injected as extra guidance.
    const guidance = `CRITIQUE FROM SELF-REVIEW (axes below ${threshold}/10 must be fixed):
  - Failing axes: ${failing.join(", ")}
  - Reviewer notes: ${critique.notes}

Rewrite the entire script addressing every failing axis. Keep what scored well; fix what didn't.`;

    try {
      const rewritten = await ctx.rewriteScript(guidance);
      // Keep whichever scored higher in aggregate.
      const sumPrev =
        critique.clinical_accuracy +
        critique.brand_voice_fit +
        critique.hook_strength +
        critique.cta_pull;
      const sumNew = await (async () => {
        const c = await critiqueScript(rewritten, ctx.systemPrompt);
        critiques.push(c);
        return (
          c.clinical_accuracy +
          c.brand_voice_fit +
          c.hook_strength +
          c.cta_pull
        );
      })();
      if (sumNew >= sumPrev) current = rewritten;
      break; // one critique-rewrite cycle is enough; latency budget matters
    } catch {
      // If rewrite fails for any reason, keep the original draft. The
      // critique is still logged so the operator can spot a regression.
      break;
    }
  }

  return { script: current, critiques };
}
