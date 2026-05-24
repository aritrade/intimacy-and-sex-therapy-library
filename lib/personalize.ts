/**
 * Personalisation primitives for the IntakeQuiz on the home page.
 *
 * Privacy-first: every answer is stored ONLY in the user's browser
 * (`localStorage`). Nothing leaves the device. No server tracking, no
 * cookies, no analytics events. The catalog page is unaffected; we
 * surface personalisation as a "Picked for you" shelf on the home page.
 *
 * To extend the quiz: add an option to the relevant question, then map
 * its id into a topic-priority list in `RECOMMENDATIONS`. The mapping
 * is intentionally a static object rather than a function so it's easy
 * to audit and translate in future.
 */

export const INTAKE_STORAGE_KEY = "istl-intake-v1";

// One question per category. Every answer here must round-trip safely
// through JSON.stringify; everything is a primitive string id.

export type ConcernId =
  | "desire_mismatch"
  | "performance"
  | "sexless"
  | "pain_or_vaginismus"
  | "lgbtq_affirming"
  | "trauma_shame"
  | "curiosity"
  | "prefer_not_say";

export type RelationshipId =
  | "single"
  | "dating"
  | "partnered"
  | "married"
  | "complicated"
  | "prefer_not_say";

export type DepthId = "gentle" | "practical" | "clinical";

export type IntakeAnswers = {
  concern: ConcernId;
  relationship: RelationshipId;
  depth: DepthId;
  completedAt: string;
};

// -----------------------------------------------------------------------------
// Question definitions (the UI renders directly from these arrays so the
// quiz layout stays trivially auditable).
// -----------------------------------------------------------------------------

export const CONCERN_OPTIONS: Array<{ id: ConcernId; label: string; hint?: string }> = [
  { id: "desire_mismatch", label: "Mismatched desire / low desire", hint: "One person wants more or less" },
  { id: "performance", label: "Performance anxiety / ED / PE", hint: "Pressure, fear, finishing too fast" },
  { id: "sexless", label: "Sexless or near-sexless relationship", hint: "Months or years of avoidance" },
  { id: "pain_or_vaginismus", label: "Pain with sex / vaginismus", hint: "Tightness, burning, fear of penetration" },
  { id: "lgbtq_affirming", label: "LGBTQ+ or asexual-affirming care", hint: "Identity, coming out, partner support" },
  { id: "trauma_shame", label: "Trauma, shame, or guilt", hint: "Past experiences shaping the present" },
  { id: "curiosity", label: "Just exploring", hint: "No specific issue, just learning" },
  { id: "prefer_not_say", label: "Prefer not to say" },
];

export const RELATIONSHIP_OPTIONS: Array<{ id: RelationshipId; label: string }> = [
  { id: "single", label: "Single" },
  { id: "dating", label: "Dating / situationship" },
  { id: "partnered", label: "In a relationship" },
  { id: "married", label: "Married / live-in" },
  { id: "complicated", label: "It's complicated" },
  { id: "prefer_not_say", label: "Prefer not to say" },
];

export const DEPTH_OPTIONS: Array<{ id: DepthId; label: string; hint: string }> = [
  { id: "gentle", label: "Gentle intro", hint: "Plain language, low-pressure framing" },
  { id: "practical", label: "Practical & evidence-based", hint: "What the research says, what to try" },
  { id: "clinical", label: "Clinical depth", hint: "Diagnosis, mechanism, peer-reviewed sources" },
];

// -----------------------------------------------------------------------------
// Scoring: each concern maps to an ordered list of catalog topic slugs and
// learning-path slugs. The home page consumes the FIRST few entries to
// build the "Picked for you" shelf.
//
// Topic slugs MUST match the values used in the `tags` table for the
// `topic` category (see catalog filters). Learning-path slugs MUST match
// `lib/paths.ts` keys.
// -----------------------------------------------------------------------------

export type Recommendation = {
  /** Short label shown in the shelf chip. */
  label: string;
  /** Where the chip links to. */
  href: string;
};

const PATH_RECS: Record<string, Recommendation> = {
  couples_reset: { label: "Couples reset path", href: "/paths/couples-reset" },
  sexless_marriage: { label: "Sexless marriage path", href: "/paths/sexless-marriage" },
  anxiety_ed: { label: "Anxiety & ED path", href: "/paths/anxiety-ed" },
  lgbtq: { label: "LGBTQ+ affirming path", href: "/paths/lgbtq-affirming" },
};

const TOPIC_REC = (slug: string, label: string): Recommendation => ({
  label,
  href: `/catalog?topic=${slug}`,
});

const RECOMMENDATIONS: Record<ConcernId, Recommendation[]> = {
  desire_mismatch: [
    PATH_RECS.couples_reset,
    TOPIC_REC("desire_discrepancy", "Desire discrepancy"),
    TOPIC_REC("low_desire", "Low desire"),
    TOPIC_REC("couple_counselling", "Couple counselling"),
  ],
  performance: [
    PATH_RECS.anxiety_ed,
    TOPIC_REC("erectile_dysfunction", "Erectile dysfunction"),
    TOPIC_REC("performance_anxiety", "Performance anxiety"),
    TOPIC_REC("premature_ejaculation", "Premature ejaculation"),
  ],
  sexless: [
    PATH_RECS.sexless_marriage,
    TOPIC_REC("sexless_marriage", "Sexless marriage"),
    TOPIC_REC("desire_discrepancy", "Desire discrepancy"),
    TOPIC_REC("couple_counselling", "Couple counselling"),
  ],
  pain_or_vaginismus: [
    TOPIC_REC("vaginismus", "Vaginismus"),
    TOPIC_REC("pain_with_sex", "Pain with sex"),
    TOPIC_REC("trauma_informed", "Trauma-informed care"),
  ],
  lgbtq_affirming: [
    PATH_RECS.lgbtq,
    TOPIC_REC("lgbtq_affirming", "LGBTQ+ affirming"),
    TOPIC_REC("ace_spectrum", "Asexual spectrum"),
    TOPIC_REC("coming_out", "Coming out"),
  ],
  trauma_shame: [
    TOPIC_REC("sexual_trauma", "Sexual trauma"),
    TOPIC_REC("shame_guilt", "Shame & guilt"),
    TOPIC_REC("trauma_informed", "Trauma-informed care"),
  ],
  curiosity: [
    TOPIC_REC("intimacy_basics", "Intimacy basics"),
    TOPIC_REC("communication", "Communication"),
    TOPIC_REC("mindfulness", "Mindfulness"),
  ],
  prefer_not_say: [
    PATH_RECS.couples_reset,
    TOPIC_REC("intimacy_basics", "Intimacy basics"),
    TOPIC_REC("communication", "Communication"),
  ],
};

/**
 * Build a shelf of recommendations from stored answers. We always return
 * 4 items — the concern provides 3, plus one tie-breaker that nudges
 * toward couples vs solo content based on relationship status. Depth
 * preference is currently advisory only (the catalog already exposes
 * difficulty filters); future work could re-rank by difficulty here.
 */
export function recommendFor(answers: IntakeAnswers): Recommendation[] {
  const primary = RECOMMENDATIONS[answers.concern] ?? RECOMMENDATIONS.curiosity;

  const couplesNudge: Recommendation | null =
    answers.relationship === "partnered" || answers.relationship === "married"
      ? TOPIC_REC("couple_counselling", "Couple counselling")
      : null;

  const soloNudge: Recommendation | null =
    answers.relationship === "single" || answers.relationship === "dating"
      ? TOPIC_REC("intimacy_basics", "Intimacy basics")
      : null;

  const tail = couplesNudge ?? soloNudge;
  const all = tail ? [...primary.slice(0, 3), tail] : primary.slice(0, 4);

  // Dedupe by href; keep first occurrence.
  const seen = new Set<string>();
  return all.filter((r) => {
    if (seen.has(r.href)) return false;
    seen.add(r.href);
    return true;
  });
}

// -----------------------------------------------------------------------------
// Storage helpers — only safe to call on the client. Server components
// must NOT import these helpers; they will throw because `localStorage`
// is undefined in Node.
// -----------------------------------------------------------------------------

export function readIntake(): IntakeAnswers | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(INTAKE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<IntakeAnswers>;
    if (!parsed.concern || !parsed.relationship || !parsed.depth) return null;
    return parsed as IntakeAnswers;
  } catch {
    return null;
  }
}

export function writeIntake(a: IntakeAnswers): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INTAKE_STORAGE_KEY, JSON.stringify(a));
  } catch {
    /* quota exceeded or storage disabled — fail silently */
  }
}

export function clearIntake(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(INTAKE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
