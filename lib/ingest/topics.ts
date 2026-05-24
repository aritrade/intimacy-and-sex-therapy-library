/**
 * Canonical taxonomy. Mirrors the "Topic taxonomy" section of the project plan.
 *
 * Every tag in the database is one of these. Sub-tags are first-class — that
 * way the catalog can facet on, say, `topic:vaginismus` directly without
 * traversing a parent->child relationship.
 *
 * Adding a tag here is the only path to it being usable. Curators do not
 * invent new tags via the admin UI.
 */

export const DIFFICULTY = ["beginner", "intermediate", "advanced"] as const;
export type Difficulty = (typeof DIFFICULTY)[number];

export const DIFFICULTY_RUBRIC: Record<Difficulty, string> = {
  beginner:
    "Written for the general public. Flesch-Kincaid reading grade ≤ 10. No required prior knowledge. No statistical or clinical jargon.",
  intermediate:
    "Clinician-facing explainer, narrative review, or intro chapter. FK 10–13. Assumes basic anatomy and DSM/ICD literacy.",
  advanced:
    "Peer-reviewed RCT, systematic review or meta-analysis, clinical guideline. FK ≥ 13. Requires methods literacy.",
};

export const TOPICS = {
  // Couple counselling
  couple_counselling: "Couple counselling",
  attachment_styles: "Attachment styles",
  communication_breakdown: "Communication breakdown",
  preference_mismatch: "Preference mismatch",
  resentment: "Resentment",
  emotional_rupture: "Emotional rupture",
  infidelity_recovery: "Infidelity recovery",

  // Sexless / dysfunctions
  sexless_relationships: "Sexless relationships",
  vaginismus: "Vaginismus",
  dyspareunia: "Dyspareunia",
  erectile_dysfunction: "Erectile dysfunction",
  premature_ejaculation: "Premature ejaculation",
  delayed_ejaculation: "Delayed ejaculation",
  anorgasmia: "Anorgasmia",
  performance_anxiety: "Performance anxiety",
  low_desire: "Low desire",
  desire_discrepancy: "Desire discrepancy",
  willingness: "Willingness vs. spontaneous desire (Basson)",
  arousal_disorders: "Arousal disorders",

  // Trauma / shame
  sexual_trauma: "Sexual trauma",
  religious_shame: "Religious or cultural shame",
  guilt: "Guilt",
  body_image: "Body image",

  // Compulsive sexual behaviour and porn distress
  compulsive_sexual_behavior: "Compulsive sexual behaviour (ICD-11 6C72)",
  porn_related_distress: "Porn-related distress",

  // Relationship structures
  open_relationships: "Open relationships",
  polyamory: "Polyamory",
  swinging: "Swinging",
  relationship_anarchy: "Relationship anarchy",
  situationships: "Situationships",
  dating: "Dating",

  // LGBTQ+
  lgbtq: "LGBTQ+ sexuality (umbrella)",
  lesbian: "Lesbian",
  gay: "Gay",
  bi_pan: "Bisexual and pansexual",
  trans_affirming_care: "Trans-affirming care (WPATH SOC8)",
  intersex: "Intersex",
  queer: "Queer",
  coming_out: "Coming out",

  // Asexual spectrum (first-class)
  ace_spectrum: "Asexual spectrum",
  demi: "Demisexual",
  gray_ace: "Gray-asexual",
  aromantic: "Aromantic",

  // Life-stage and underserved populations
  postpartum: "Postpartum sexuality",
  perimenopause: "Perimenopause / menopause",
  pregnancy: "Pregnancy",
  cancer_survivorship: "Cancer survivorship",
  diabetes: "Diabetes-related sexual health",
  cardiovascular: "Cardiovascular and sexual health",
  ms: "Multiple sclerosis and sexuality",
  disability: "Disability and sexuality",
  autism: "Autism and sexuality",
  adhd: "ADHD and desire",
  aging: "Aging and sexuality",
} as const;

export type Topic = keyof typeof TOPICS;

export const POPULATIONS = {
  general: "General audience",
  women: "Women / AFAB",
  men: "Men / AMAB",
  couples: "Couples",
  lgbtq: "LGBTQ+",
  ace: "Asexual spectrum",
  trans: "Transgender / non-binary",
  parents: "Parents",
  teens_ya: "Teens & young adults (18+)",
  older_adults: "Older adults",
  disability: "People with disabilities",
  india: "India-specific framing",
} as const;

export type Population = keyof typeof POPULATIONS;

/**
 * Therapeutic modalities. Used to facet content by approach, and to let the
 * companion / chatbot pull from the right subset when a user asks about a
 * specific framework.
 */
export const MODALITIES = {
  cbt: "Cognitive Behavioural Therapy",
  eft: "Emotionally Focused Therapy",
  gottman: "Gottman Method",
  sensate_focus: "Sensate Focus (Masters & Johnson)",
  mi: "Motivational Interviewing",
  ifs: "Internal Family Systems",
  trauma_informed: "Trauma-informed care",
  ipt: "Interpersonal Therapy",
  mindfulness: "Mindfulness-based therapy",
  plissit: "PLISSIT / EX-PLISSIT model",
  dual_control: "Dual-control model (Bancroft & Janssen)",
  basson_responsive_desire: "Basson responsive-desire model",
  gender_affirming: "Gender-affirming care (WPATH SOC8)",
  psychoeducation: "Psychoeducation only",
} as const;

export type Modality = keyof typeof MODALITIES;

export type TaxonomySeed = {
  topics: Array<{ name: Topic; description: string }>;
  populations: Array<{ name: Population; description: string }>;
  modalities: Array<{ name: Modality; description: string }>;
  difficulty: ReadonlyArray<Difficulty>;
};

export const TAXONOMY: TaxonomySeed = {
  topics: (Object.keys(TOPICS) as Topic[]).map((name) => ({
    name,
    description: TOPICS[name],
  })),
  populations: (Object.keys(POPULATIONS) as Population[]).map((name) => ({
    name,
    description: POPULATIONS[name],
  })),
  modalities: (Object.keys(MODALITIES) as Modality[]).map((name) => ({
    name,
    description: MODALITIES[name],
  })),
  difficulty: DIFFICULTY,
};
