/**
 * Decision aid: "Should I start sex therapy?"
 *
 * A small branching tree. Designed to *inform*, not to gatekeep. Every branch
 * ends with an honest summary that leans toward 'a clinician can help' rather
 * than 'you don't need help' — but never pushes urgent treatment when the
 * evidence is mild.
 */

export type Choice = { label: string; next: string };
export type Node = {
  id: string;
  prompt: string;
  body?: string;
  choices?: Choice[];
  outcome?: {
    headline: string;
    body: string;
    cta?: { label: string; href: string };
  };
};

export const DECISION_TREE: Node[] = [
  {
    id: "start",
    prompt: "What's the main reason you're here?",
    choices: [
      { label: "Sex feels stuck or absent in my relationship", next: "couple-distance" },
      { label: "I'm worried about my own sexual functioning", next: "self-functioning" },
      { label: "I want to understand my desire / orientation / identity", next: "identity" },
      { label: "I'm dealing with shame, guilt, or trauma around sex", next: "trauma" },
      { label: "I'm worried about pornography or compulsive behavior", next: "csbd" },
    ],
  },
  {
    id: "couple-distance",
    prompt: "How long has this been going on?",
    choices: [
      { label: "Less than a few months", next: "couple-recent" },
      { label: "More than 6 months", next: "couple-chronic" },
    ],
  },
  {
    id: "couple-recent",
    prompt: "What's currently most true?",
    choices: [
      { label: "We're still talking openly about it", next: "outcome-self-help-couples" },
      { label: "We avoid the topic or fight about it", next: "outcome-couples-therapy" },
    ],
  },
  {
    id: "couple-chronic",
    prompt: "What's currently most true?",
    choices: [
      { label: "There's also unresolved hurt or betrayal", next: "outcome-couples-therapy-strong" },
      { label: "Mostly distance, no major rupture", next: "outcome-couples-therapy" },
    ],
  },
  {
    id: "self-functioning",
    prompt: "Is this affecting your physical health, relationship, or daily functioning?",
    choices: [
      { label: "Yes, significantly", next: "outcome-clinician-medical" },
      { label: "Mildly, mostly the worry itself", next: "outcome-self-help-anxiety" },
    ],
  },
  {
    id: "identity",
    prompt: "What feels most important right now?",
    choices: [
      { label: "Information, language, and reading", next: "outcome-self-explore" },
      { label: "Talking to someone affirming", next: "outcome-affirming-clinician" },
    ],
  },
  {
    id: "trauma",
    prompt: "Is the past trauma showing up in your body or relationships now?",
    choices: [
      { label: "Yes — flashbacks, freezing, dissociation, fear", next: "outcome-trauma-clinician" },
      { label: "Sometimes shame or avoidance", next: "outcome-self-help-shame" },
    ],
  },
  {
    id: "csbd",
    prompt: "Are these behaviors causing real-world harm (relationship, work, finances) or distress?",
    choices: [
      { label: "Yes, real harm", next: "outcome-csbd-clinician" },
      { label: "Mostly distress about the behavior itself", next: "outcome-csbd-self" },
    ],
  },

  // Outcomes
  {
    id: "outcome-self-help-couples",
    prompt: "",
    outcome: {
      headline: "You may benefit from a structured self-guided start",
      body: "Try the Couples Reset path together. If you don't see movement in 4 weeks, that's a strong signal to bring in a couples therapist.",
      cta: { label: "Open Couples Reset", href: "/paths/couples-reset" },
    },
  },
  {
    id: "outcome-couples-therapy",
    prompt: "",
    outcome: {
      headline: "Couples therapy is likely to help",
      body: "Distance for over 6 months without resolution rarely fixes itself. Look for an emotionally focused therapy (EFT) or Gottman-trained clinician.",
      cta: { label: "Find a clinician", href: "/clinicians" },
    },
  },
  {
    id: "outcome-couples-therapy-strong",
    prompt: "",
    outcome: {
      headline: "Couples therapy is strongly recommended",
      body: "When unresolved hurt or betrayal layers on top of distance, structured couples therapy is the most evidence-based path. Trying to repair this alone often makes it worse.",
      cta: { label: "Find a clinician", href: "/clinicians" },
    },
  },
  {
    id: "outcome-clinician-medical",
    prompt: "",
    outcome: {
      headline: "Talk to a clinician — start with primary care",
      body: "When sexual functioning is affecting your health or daily life, the first stop is usually primary care or a urologist/gynaecologist who can rule out medical causes (vascular, hormonal, medication side effects). After that, a sex therapist can help with the psychological side.",
      cta: { label: "Find a clinician", href: "/clinicians" },
    },
  },
  {
    id: "outcome-self-help-anxiety",
    prompt: "",
    outcome: {
      headline: "Self-guided is reasonable",
      body: "Performance anxiety often responds to evidence-based self-work — sensate focus, mindfulness, and the dual-control framing. Take the GAD-7 to map the anxiety side, and try the Anxiety/ED path.",
      cta: { label: "Open Anxiety/ED path", href: "/paths/anxiety-ed" },
    },
  },
  {
    id: "outcome-self-explore",
    prompt: "",
    outcome: {
      headline: "Start with the catalog",
      body: "The catalog is built for this. Filter by topic and difficulty. The glossary defines clinical terms in plain language.",
      cta: { label: "Open the catalog", href: "/catalog?topic=lgbtq_affirming" },
    },
  },
  {
    id: "outcome-affirming-clinician",
    prompt: "",
    outcome: {
      headline: "Look for an affirming clinician",
      body: "Affirming care matters. Our clinician directory tags affirming credentials and specialties.",
      cta: { label: "Find an affirming clinician", href: "/clinicians" },
    },
  },
  {
    id: "outcome-trauma-clinician",
    prompt: "",
    outcome: {
      headline: "Trauma-trained therapy is recommended",
      body: "Body-up modalities (EMDR, somatic experiencing) and trauma-focused CBT are the evidence-based approaches when trauma is showing up physically. Sex therapy alone, without trauma work first or alongside, rarely resolves this.",
      cta: { label: "Find a clinician", href: "/clinicians" },
    },
  },
  {
    id: "outcome-self-help-shame",
    prompt: "",
    outcome: {
      headline: "Self-paced shame work is a fair first step",
      body: "Self-compassion practices, the myths page, and accurate information help quite a bit. If shame keeps you from intimacy, a sex therapist with shame-resilience training can speed the work.",
      cta: { label: "Open the Myths page", href: "/myths" },
    },
  },
  {
    id: "outcome-csbd-clinician",
    prompt: "",
    outcome: {
      headline: "Compulsive sexual behavior — speak with a clinician",
      body: "When sexual behaviors create real-world harm — to relationships, work, finances — that meets the threshold for compulsive sexual behavior disorder (ICD-11). Evidence-based help exists. Avoid 'sex addiction' programs that pathologise normal sexuality; look for ICD-11-aligned clinicians.",
      cta: { label: "Find a clinician", href: "/clinicians" },
    },
  },
  {
    id: "outcome-csbd-self",
    prompt: "",
    outcome: {
      headline: "Distress without harm is worth exploring",
      body: "Distress about porn or sexual behavior, in the absence of real-world harm, is common and often shame-driven. Read the Myths page on porn-related distress before assuming you have an addiction.",
      cta: { label: "Open the Myths page", href: "/myths" },
    },
  },
];

export function getNode(id: string): Node | undefined {
  return DECISION_TREE.find((n) => n.id === id);
}
