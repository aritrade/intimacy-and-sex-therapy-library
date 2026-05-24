/**
 * Lightweight crisis-keyword detection.
 *
 * This is intentionally a high-recall regex layer; the LLM safety prompt is the
 * authoritative second pass. Trips here cause the UI to surface CrisisBanner with
 * region-aware hotlines. We never log message content for these events — only
 * a hashed session id and an event_type — see crisis_events table.
 */

export type CrisisCategory =
  | "self_harm"
  | "imminent_violence"
  | "sexual_violence"
  | "minor_at_risk"
  | "domestic_violence";

const PATTERNS: Record<CrisisCategory, RegExp[]> = {
  self_harm: [
    /\b(kill|end|hurt)\s+(my\s*self|myself)\b/i,
    /\bsuicid(?:e|al)\b/i,
    /\b(don'?t|do\s*not)\s+want\s+to\s+(live|be\s+here|exist)\b/i,
    /\bmar(?:na|jaaun|jaau|jaoon)\s+(chahta|chahti|chahoon)\b/i, // Hinglish "want to die"
    /\bjeena\s+nahi(?:n)?\s+chahta\b/i,
  ],
  imminent_violence: [
    /\b(?:going|about)\s+to\s+(?:hurt|kill|harm)\s+(?:him|her|them|someone)\b/i,
    /\bplan\s+to\s+hurt\b/i,
  ],
  sexual_violence: [
    /\brape(d)?\b/i,
    /\bsexual(ly)?\s+assault(ed)?\b/i,
    /\bmolest(ed|ation)\b/i,
    /\bforced\s+(?:me|him|her|them)\s+(?:to|into)\b/i,
  ],
  minor_at_risk: [
    /\b(?:i\s+am|i'?m)\s+(?:1[0-7]|under\s*1?\s*8|a\s+minor)\b/i,
    /\bchild(?:hood)?\s+(?:abuse|assault)\b/i,
  ],
  domestic_violence: [
    /\b(my\s+)?(husband|wife|partner|in[- ]?laws?)\s+(beat|hits|hurt|hurts)\s+(me|us)\b/i,
    /\bmaar(?:ta|ti)\s+hai\b/i, // Hinglish "[he/she] beats me"
  ],
};

export type GuardrailHit = {
  category: CrisisCategory;
  matched_pattern: string;
};

/**
 * Run all patterns against the input. Returns hits (possibly multiple).
 * Caller is responsible for NOT persisting the input.
 */
export function detectCrisis(text: string): GuardrailHit[] {
  const hits: GuardrailHit[] = [];
  for (const category of Object.keys(PATTERNS) as CrisisCategory[]) {
    for (const re of PATTERNS[category]) {
      if (re.test(text)) {
        hits.push({ category, matched_pattern: re.source });
        break; // one hit per category is enough
      }
    }
  }
  return hits;
}

/**
 * Refusal categories the LLM system prompt enforces. Mirrored here so the
 * frontend can show consistent copy and so the eval harness has a single
 * source of truth.
 */
export const REFUSAL_CATEGORIES = [
  "explicit_or_erotic_content",
  "advice_for_minors",
  "medication_dosing",
  "diagnostic_statements",
  "anti_lgbtq_or_anti_ace_framing",
  "encouragement_of_self_harm",
  "encouragement_of_violence",
] as const;

export type RefusalCategory = (typeof REFUSAL_CATEGORIES)[number];
