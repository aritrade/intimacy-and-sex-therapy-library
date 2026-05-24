/**
 * Learning paths — content-only seeds. Curator-authored. Each step references
 * a primer (curator-written), a reflection prompt, and 1–3 catalog topics or
 * search queries that lead the learner to evidence.
 */

export type PathStep = {
  id: string;
  title: string;
  primer: string;
  reflection?: string;
  resources?: Array<{ label: string; href: string }>;
};

export type Path = {
  slug: string;
  title: string;
  audience: string;
  duration: string;
  accent: "plum" | "teal" | "coral" | "accent";
  summary: string;
  steps: PathStep[];
};

export const PATHS: Path[] = [
  {
    slug: "couples-reset",
    title: "Couples reset — rebuilding closeness",
    audience: "Long-term partners feeling distant or stuck in conflict",
    duration: "4 weeks · 15 min/day",
    accent: "plum",
    summary:
      "A four-week guided sequence that helps couples slow down, rebuild safety, and reintroduce play. Grounded in emotionally focused therapy and the dual-control model.",
    steps: [
      {
        id: "cr-1",
        title: "Map the cycle, not the person",
        primer:
          "Most stuck couples are stuck in a cycle, not in a character flaw. Naming the cycle lowers blame and opens curiosity. EFT calls this the negative interaction cycle.",
        reflection:
          "Write down the last argument as a sequence: trigger → my move → partner's move → outcome. No interpretation, just the moves.",
        resources: [
          { label: "Emotionally focused therapy basics (catalog)", href: "/catalog?topic=couple_counselling&difficulty=beginner" },
        ],
      },
      {
        id: "cr-2",
        title: "Bids and turning toward",
        primer:
          "Gottman's research shows that the small daily moments — bids for attention, affection, humor — predict long-term satisfaction more than big gestures. Couples who 'turn toward' bids stay close.",
        reflection: "Notice three bids today (yours or theirs). What did you do?",
      },
      {
        id: "cr-3",
        title: "Sensate focus, week one",
        primer:
          "Sensate focus is a structured, non-goal-oriented touch exercise developed by Masters & Johnson. It removes performance pressure and rebuilds embodied closeness.",
        reflection:
          "Schedule 20 minutes of touch with no expectation of intercourse. Pay attention to texture, temperature, and your breath.",
        resources: [
          { label: "Sensate focus, evidence (chat)", href: "/chat?q=sensate+focus" },
        ],
      },
      {
        id: "cr-4",
        title: "Repair after rupture",
        primer:
          "Every couple ruptures. Healthy couples repair. A repair attempt can be silly, tender, or direct — what matters is that one of you reaches and the other accepts.",
        reflection: "Try one repair phrase you wouldn't normally use ('let's start over', 'I'm sorry, I love you').",
      },
    ],
  },
  {
    slug: "sexless-marriage",
    title: "When intimacy has thinned out",
    audience: "Partners experiencing months or years of low sexual contact",
    duration: "3 weeks · self-paced",
    accent: "coral",
    summary:
      "A non-blaming exploration of why intimacy fades and what evidence-based interventions look like — including responsive desire, the dual-control model, and stress as a sexual brake.",
    steps: [
      {
        id: "sm-1",
        title: "Reframe desire — spontaneous vs. responsive",
        primer:
          "Many people experience responsive desire (arousal that follows context and stimulation) rather than spontaneous desire (out-of-the-blue arousal). Neither is broken; one is more common in long-term partnerships.",
        reflection: "When was the last time you felt wanting? What surrounded that moment?",
        resources: [
          { label: "Responsive desire (catalog)", href: "/catalog?topic=desire_discrepancy" },
        ],
      },
      {
        id: "sm-2",
        title: "Brakes and accelerators",
        primer:
          "The dual-control model (Bancroft & Janssen) distinguishes sexual accelerators (what turns you on) from brakes (what turns you off). Most low-desire situations are about brakes — stress, resentment, body image, performance pressure — more than missing accelerators.",
        reflection:
          "List your top three brakes right now. Which is most under your control to ease this week?",
      },
      {
        id: "sm-3",
        title: "Have the harder conversation",
        primer:
          "Couples often avoid the sex conversation because they fear hurting the other. Avoidance preserves the impasse. Try a low-stakes opener: not 'why don't we have sex anymore?' but 'I miss being close to you. Can we talk about what feels good?'",
        reflection: "Schedule a 30-minute conversation. Pick a neutral place. No phones.",
      },
    ],
  },
  {
    slug: "anxiety-ed",
    title: "Performance anxiety and ED",
    audience: "Anyone for whom anxiety drives erection or arousal difficulty",
    duration: "2 weeks · 10 min/day",
    accent: "teal",
    summary:
      "A short sequence that separates performance anxiety from physiological causes, introduces self-compassion and exposure, and points to evidence on when to involve a clinician.",
    steps: [
      {
        id: "ae-1",
        title: "Rule out the medical first",
        primer:
          "Erection difficulty can have medical causes (vascular, hormonal, medication side effects). Before assuming it's psychological, a primary-care or urology checkup is wise. ED is also an early marker for cardiovascular risk.",
        resources: [
          { label: "Find a clinician", href: "/clinicians" },
          { label: "Take the GAD-7 to map anxiety", href: "/assessments/gad7" },
        ],
      },
      {
        id: "ae-2",
        title: "Pleasure, not performance",
        primer:
          "Performance anxiety narrows attention onto a goal (erection, orgasm). Anxiety further activates sympathetic arousal, which suppresses sexual response. The intervention is wide attention — sensation, breath, partner — not harder effort.",
        reflection:
          "During intimacy this week, intentionally widen attention from 'am I hard?' to 'what does my partner's skin feel like?' for 30 seconds.",
      },
      {
        id: "ae-3",
        title: "Reduce the brake, don't push the accelerator",
        primer:
          "Trying to force arousal usually makes the brake stronger. Restoring sexual response often comes from reducing pressure (no-intercourse weeks, sensate focus, mindfulness) rather than adding stimulation.",
      },
    ],
  },
  {
    slug: "lgbtq-affirming",
    title: "LGBTQ+ affirming intimacy",
    audience: "LGBTQ+ individuals and partners; allies",
    duration: "2 weeks · self-paced",
    accent: "plum",
    summary:
      "A path that centers minority stress, identity affirmation, and partnered intimacy. Includes WPATH SOC8 references and trauma-informed framing.",
    steps: [
      {
        id: "la-1",
        title: "Minority stress and the body",
        primer:
          "Minority stress (chronic stigma, anticipated rejection, internalized stigma) is a real and measurable stressor. It can show up in the body as hypervigilance, dissociation, or low arousal. Naming it is the first protective move.",
      },
      {
        id: "la-2",
        title: "Affirming language and bodies",
        primer:
          "Sex therapy benefits from gender-neutral, body-respecting language. 'External genitals' / 'internal genitals' / 'chest' or specific words a person uses for their own body, rather than assumed terms.",
        resources: [
          { label: "WPATH SOC8 (library)", href: "/library" },
        ],
      },
      {
        id: "la-3",
        title: "Pleasure as a political act",
        primer:
          "Reclaiming pleasure after a long history of stigma is part of recovery. This is not frivolous; it is clinical. Affirming pleasure literature points to mindfulness, expanded definitions of sex, and chosen-family support as protective.",
      },
    ],
  },
];

export function getPath(slug: string): Path | undefined {
  return PATHS.find((p) => p.slug === slug);
}
