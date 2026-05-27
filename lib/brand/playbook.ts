/**
 * Brand + clinical + marketing playbook.
 *
 * Single source of truth for the "intelligence" that gets injected
 * into the script generator's system prompt on EVERY call (first-pass
 * AND rewrite). Previously the prompt only had safety + format/pacing
 * guidance; this module adds the three missing layers:
 *
 *   1. CLINICAL_PLAYBOOK   - evidence-grounded framings the LLM can
 *                            lean on, required hedges, banned framings.
 *                            Sourced from the major consensus-evidenced
 *                            frameworks in sex therapy + couples
 *                            therapy literature (Gottman, EFT, Schnarch,
 *                            sensate focus, attachment theory).
 *
 *   2. BRAND_VOICE         - pulls NARRATOR.brief/voiceDirection from
 *                            persona.ts AND adds prose-level rules the
 *                            persona doesn't (sentence cadence, sensory
 *                            anchors, second-person mandate, no-jargon
 *                            override).
 *
 *   3. MARKETING_PLAYBOOK  - 6 named hook patterns, per-platform
 *                            retention beats, CTA library categorised
 *                            by intent. Marketing distilled from the
 *                            short-form playbooks of education channels
 *                            in the same vertical (Esther Perel,
 *                            Logan Ury, Therapy in a Nutshell) - the
 *                            principles, not their wording.
 *
 *   4. STRATEGY_BY_STYLE   - per-format structural beats (long-form
 *                            essay: hook -> context -> mechanism ->
 *                            reframe -> practice -> close; etc).
 *
 * Plus `feedbackToDirective()` which converts each typed reviewer
 * reason into a specific actionable directive the LLM can execute,
 * so "tone_off" becomes "shift voice one notch warmer; drop any
 * hedging phrases" rather than just the raw label.
 *
 * The full playbook is rendered into the prompt via `playbookPrompt()`,
 * which returns a single multi-section markdown block. Kept as one
 * function so we can A/B different orderings or trim sections via
 * env if Groq starts truncating us.
 *
 * Tuning knobs (env):
 *   - SCRIPT_PLAYBOOK_DISABLE=true     -> skip injecting playbook (A/B baseline)
 *   - SCRIPT_PLAYBOOK_TRIM=true        -> only inject the half most
 *                                         relevant to the active style
 *                                         (saves ~800 tokens; usually
 *                                         a non-event with Llama-3 70b
 *                                         128k context but useful on
 *                                         the smaller fallback models).
 */

import { NARRATOR } from "@/lib/brand/persona";
import type { RequestChangesReason } from "@/lib/social/review-reasons";

export type ScriptStyleId =
  | "typography"
  | "stock"
  | "carousel"
  | "long_form_essay";

/* ────────────────────────────────────────────────────────────────────
 * 1. CLINICAL PLAYBOOK
 * ────────────────────────────────────────────────────────────────── */

/**
 * Frameworks we explicitly invite the LLM to lean on. Each is a
 * one-liner the model can paraphrase. None of these is a "diagnosis"
 * or "prescription" — they are pattern names that have consensus
 * evidence and are safe to reference in a public-education context.
 *
 * Adding a framework here makes it available to the LLM as an
 * anchor; remove one if a clinician flags it as out-of-scope.
 */
const CLINICAL_FRAMEWORKS = [
  {
    name: "Responsive vs. spontaneous desire (Basson, Nagoski)",
    summary:
      "Many adults experience desire that shows up AFTER touch begins, not before. Useful for de-pathologising 'low libido' in long-term partnerships.",
  },
  {
    name: "Dual-control model of arousal (Bancroft & Janssen)",
    summary:
      "Arousal is a balance of accelerators (turn-ons) and brakes (worries/distractions). Useful for explaining why context, not just stimulus, matters.",
  },
  {
    name: "Emotionally-focused therapy / attachment cycles (Sue Johnson)",
    summary:
      "Conflict often masks a protest of disconnection. Useful for reframing 'we keep fighting about sex' as 'we keep missing each other emotionally'.",
  },
  {
    name: "Sound Relationship House + four horsemen (Gottman)",
    summary:
      "Criticism / contempt / defensiveness / stonewalling predict distress more than topic does. Useful for tone-of-fight content.",
  },
  {
    name: "Sensate focus (Masters & Johnson, modernised)",
    summary:
      "Structured non-genital touch that interrupts performance pressure. Always frame as a practice the listener might explore, never a prescription.",
  },
  {
    name: "Eroticism in long-term partnership (Esther Perel)",
    summary:
      "Desire and security trade off; intimacy doesn't automatically produce eroticism. Useful for 'why has it gone flat' content.",
  },
  {
    name: "Sexual response variability (Klein, Tiefer)",
    summary:
      "There is no single 'normal' arousal pattern. Useful for inclusive framing across orientations, age, neurotype.",
  },
] as const;

/**
 * Hedges the script MUST use to convert clinical-sounding claims into
 * education-safe language. The system prompt asks the LLM to pick the
 * appropriate hedge per claim.
 */
const REQUIRED_HEDGES = [
  "what many people describe as…",
  "in the research literature this is sometimes called…",
  "for a lot of couples this looks like…",
  "if any of this resonates, you might explore…",
] as const;

/**
 * Framings to avoid. The first three are clinical-safety; the rest
 * are brand decisions. The LLM is told that breaking any of these
 * triggers an automatic rewrite.
 */
const BANNED_FRAMINGS = [
  "ANY pathologising language ('disorder', 'dysfunction', 'abnormal', 'broken')",
  "ANY prescriptive 'you should' / 'you must' / 'never do X' phrasing",
  "ANY medical recommendation, dosing, or substitution for clinical care",
  "implied gender essentialism ('men always…', 'women always…')",
  "implied mononormativity ('every healthy couple…', 'real intimacy means…')",
  "moralising about anyone's choices, kinks, or relationship structure",
  "the phrases 'real men/women', 'normal couples', 'healthy people' as standalone bars",
] as const;

const CLINICAL_PLAYBOOK = `## CLINICAL LAYER
Lean on these consensus-evidenced frameworks when relevant. Paraphrase; never quote verbatim. NEVER cite one you haven't actually used in the script.
${CLINICAL_FRAMEWORKS.map((f) => `  • ${f.name} — ${f.summary}`).join("\n")}

REQUIRED HEDGES (pick the one that fits each claim — clinical claims without a hedge are auto-rewrites):
${REQUIRED_HEDGES.map((h) => `  • "${h}"`).join("\n")}

BANNED FRAMINGS (any of these triggers a rewrite):
${BANNED_FRAMINGS.map((b) => `  • ${b}`).join("\n")}`;

/* ────────────────────────────────────────────────────────────────────
 * 2. BRAND VOICE
 * ────────────────────────────────────────────────────────────────── */

const BRAND_VOICE = `## BRAND VOICE
Narrator persona: ${NARRATOR.brief}

${NARRATOR.voiceDirection}

PROSE-LEVEL RULES (the persona above sets character; these set sentence-level behaviour):
  • Second person ("you", "your partner") — never "one" / "a person" / "individuals".
  • Open with a concrete sensory anchor when possible (rain on the window, two cups of tea, the pause before someone answers). Abstract openings lose viewers in the first 2 seconds.
  • Sentence length variance is mandatory: alternate one short sentence (≤8 words) with a longer one. Never three same-length sentences in a row.
  • Jargon allowed only when defined in the same sentence. "Responsive desire — arousal that shows up after touch begins" is fine. "Responsive desire" alone is not.
  • Contractions on. No "do not", "it is", "you will".
  • No throat-clearing openers ("Today we're going to talk about…", "Have you ever wondered…"). Get to the hook in sentence one.
  • If a sentence could appear in a textbook, rewrite it. If a sentence could appear in a friend's voice memo at 11pm, keep it.`;

/* ────────────────────────────────────────────────────────────────────
 * 3. MARKETING PLAYBOOK
 * ────────────────────────────────────────────────────────────────── */

const HOOK_PATTERNS = [
  {
    name: "Named-pattern reveal",
    example:
      "There's a name for the way you keep starting fights right before sex — and it's not what you think.",
  },
  {
    name: "Contrarian",
    example:
      "Most advice tells you to communicate more. The research says the opposite.",
  },
  {
    name: "Curiosity gap",
    example:
      "Couples who stay in love for thirty years all do this one thing on Tuesday nights.",
  },
  {
    name: "Myth-bust",
    example:
      "If you only feel desire after touch starts, nothing is wrong with you. Here's why.",
  },
  {
    name: "Identity reframe",
    example:
      "You're not low-libido. You're responsive — and most adults are.",
  },
  {
    name: "Problem-agitation-reframe",
    example:
      "You're not avoiding sex. You're avoiding the fight that always follows.",
  },
] as const;

const MARKETING_PLAYBOOK = `## MARKETING LAYER
HOOK PATTERNS — the first line of the script ("hook" field) MUST follow one of these patterns. Pick the one that best fits the brief.
${HOOK_PATTERNS.map((p) => `  • ${p.name}  — e.g. "${p.example}"`).join("\n")}

RETENTION RULES (apply per platform; the renderer caps to the right format):
  • IG Reels / YT Shorts: payoff teased in the hook is delivered in the FIRST body scene, not the last. The CTA is a soft loop ("if this lands, the library has more on this") — never "follow for more".
  • YT long-form: include a "why this matters now" beat within the first 12 seconds. Mid-roll (around 50% through), drop a callback to the hook to reset attention.
  • FB Reels: lead with a sentimental anchor (a small scene, a moment) before the clinical content.

CTA LIBRARY — never invent a CTA outside this register:
  • Library pull:    "Explore the library to learn more about X."
  • Soft practice:   "If any of this resonates, you might try X this week."
  • Reflection cue:  "Sit with that for a moment. We'll come back to it."
  • Resource pull:   "Read more on the page — there's a chapter on X."
  • Never:           "Follow / Like / Subscribe / Comment below / Tag someone" — these break the brand.`;

/* ────────────────────────────────────────────────────────────────────
 * 4. PER-STYLE STRATEGY
 * ────────────────────────────────────────────────────────────────── */

const STRATEGY_BY_STYLE: Record<ScriptStyleId, string> = {
  typography: `## STRUCTURE FOR THIS STYLE (typography reel)
Beat plan: hook (≤7 words) → 2 reframe beats → 1 micro-practice → CTA. Each scene's text appears on screen AND is voiced. Aim for the hook to be re-screenshotable (works as a still image with no context).`,

  stock: `## STRUCTURE FOR THIS STYLE (stock-footage reel)
Beat plan: sensory hook → name-the-pattern beat → the-mechanism beat → permission beat → CTA. Each scene leads with a concrete noun (the footage search depends on it: "morning light through curtains", "two cups of tea", "rain on window"). Avoid abstract scenes ("intimacy", "connection") — pair them with a concrete proxy.`,

  carousel: `## STRUCTURE FOR THIS STYLE (carousel)
Beat plan per slide: (1) hook question, (2) the common assumption, (3) the actual mechanism, (4) what it looks like in practice, (5) the reframe, (6-9) optional depth slides, (final) the CTA. Each slide is read silently — it must make sense without the previous one for the audience that lands mid-carousel.`,

  long_form_essay: `## STRUCTURE FOR THIS STYLE (long-form essay)
Beat plan (6 chapters typical):
  1. HOOK         — named-pattern or contrarian opening (≤2 sentences).
  2. WHY NOW      — why this matters today, for this listener (≤2 sentences inside chapter 1 or as chapter 2).
  3. CONTEXT      — common framing the listener has been given, and where it falls short.
  4. MECHANISM    — what's actually happening (lean on ONE of the clinical frameworks above).
  5. REFRAME      — the new mental model in 1–2 sentences the listener can carry away.
  6. PRACTICE     — one small, specific thing they might try this week (never prescriptive — "you might explore").
  7. CLOSE / CTA  — soft library or resource pull, no follow-bait.
The first sentence of each chapter is its on-screen lower-third (≤14 words). The rest of the paragraph is what the narrator actually reads.`,
};

/* ────────────────────────────────────────────────────────────────────
 * 5. STRUCTURED REVIEWER FEEDBACK -> DIRECTIVE
 * ────────────────────────────────────────────────────────────────── */

/**
 * Turn a typed reviewer reason into a specific, actionable directive
 * the LLM can execute. The free-text `notes` are then appended as
 * supporting context, so the model sees both the structured intent
 * AND the reviewer's exact wording.
 *
 * Keep the directives short and imperative — the LLM follows
 * imperative-mood instructions noticeably better than declarative.
 */
export function feedbackToDirective(reason: string): string {
  const map: Partial<Record<RequestChangesReason | string, string>> = {
    factual_inaccuracy:
      "Identify any unsupported factual claim in the previous draft and either (a) ground it in one of the clinical frameworks above or (b) remove it. Do not invent a citation.",
    needs_citation:
      "Surface the cited source explicitly in the citationLine field AND attribute the framing in the body where the claim is made.",
    tone_off:
      "Shift voice one notch warmer and one notch less clinical. Drop any hedging filler ('I think', 'sort of', 'kind of'). Replace any teacher-y phrasing with peer-to-peer phrasing. Re-read against the BRAND VOICE block above.",
    not_inclusive:
      "Audit pronouns, assumed relationship structure, and assumed orientation. Make gender-neutral by default, mononormativity-free, asexual-affirming. Replace any phrase that implies a default body or default partnership.",
    medical_overreach:
      "Strip every diagnostic, dosing, or prescriptive medical statement. Replace with one of the REQUIRED HEDGES. If the brief cannot be safely covered without medical overreach, refuse via the warning field.",
    scope_creep:
      "Re-anchor on the original brief. Cut any beat that doesn't directly serve the brief's central question. Aim to remove 20-30% of the body word count.",
    duplicate_content:
      "Treat the previous draft as off-limits. Pick a different angle entirely (different hook pattern, different clinical framework, different practice). Vocabulary and sentence cadence should not echo the previous attempt.",
    other:
      "Read the reviewer's free-text note carefully and address the specific change requested while preserving the brand and clinical layers.",
  };
  return map[reason] ?? map.other!;
}

/* ────────────────────────────────────────────────────────────────────
 * 6. PROMPT ASSEMBLY
 * ────────────────────────────────────────────────────────────────── */

export type PlaybookOptions = {
  /** Style we're generating for; controls which STRATEGY_BY_STYLE block is included. */
  style: ScriptStyleId;
};

/**
 * Render the full playbook into a single markdown block to be appended
 * to the script-generator's system prompt. Skips the whole block if
 * `SCRIPT_PLAYBOOK_DISABLE=true` is set (A/B baseline). Trims to the
 * most relevant half if `SCRIPT_PLAYBOOK_TRIM=true` (saves ~800
 * tokens for smaller fallback models).
 */
export function playbookPrompt(opts: PlaybookOptions): string {
  if ((process.env.SCRIPT_PLAYBOOK_DISABLE ?? "").toLowerCase() === "true") {
    return "";
  }

  const trim = (process.env.SCRIPT_PLAYBOOK_TRIM ?? "").toLowerCase() === "true";
  const sections = trim
    ? [BRAND_VOICE, MARKETING_PLAYBOOK, STRATEGY_BY_STYLE[opts.style]]
    : [
        CLINICAL_PLAYBOOK,
        BRAND_VOICE,
        MARKETING_PLAYBOOK,
        STRATEGY_BY_STYLE[opts.style],
      ];

  return [
    "",
    "════════════ PLAYBOOK ════════════",
    "The blocks below are the brand's clinical, voice, marketing, and structural standards. Treat every bullet as a hard constraint. Self-check the draft against each block before returning.",
    "",
    ...sections,
    "════════════════════════════════════",
  ].join("\n");
}

/**
 * Render a structured-feedback block. Each note is converted to an
 * actionable directive via `feedbackToDirective`, then the reviewer's
 * own words are appended as supporting context. This is what the
 * rewrite path uses INSTEAD of dumping raw reviewer notes into the
 * prompt; the previous behaviour gave the LLM a label without the
 * "what to actually do with it" mapping.
 */
export function structuredFeedbackPrompt(
  notes: Array<{ reason: string; notes?: string }>,
): string {
  if (notes.length === 0) return "";
  return [
    "",
    "REVIEWER FEEDBACK (each entry is a directive the model MUST execute):",
    ...notes.map((n, i) => {
      const directive = feedbackToDirective(n.reason);
      const verbatim = n.notes ? `\n     reviewer note: "${n.notes}"` : "";
      return `  ${i + 1}. [${n.reason}] ${directive}${verbatim}`;
    }),
  ].join("\n");
}
