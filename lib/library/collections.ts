/**
 * Curated reading journeys ("Collections"). Each maps a human-friendly theme to
 * a set of taxonomy topic slugs (see lib/ingest/topics.ts). Collection contents
 * are derived at render time from whatever published library items carry those
 * topic tags, so collections grow automatically as the corpus grows — no manual
 * per-item curation, no risk of dangling references.
 *
 * Inclusivity is first-class: asexual-spectrum, LGBTQ+, trans, polyamory/ENM,
 * and disability journeys are all here alongside the clinical ones.
 */

import type { Topic } from "@/lib/ingest/topics";
import { TOPICS } from "@/lib/ingest/topics";

export type Collection = {
  slug: string;
  title: string;
  blurb: string;
  /** Taxonomy topic slugs an item must carry (any-of) to belong here. */
  topics: Topic[];
  /** Decorative accent used on the card. */
  accent: "accent" | "coral";
};

export const COLLECTIONS: Collection[] = [
  {
    slug: "asexuality-101",
    title: "Asexuality 101",
    blurb:
      "Understanding the asexual spectrum — ace, demisexual, gray-ace, and aromantic identities — with affirming, evidence-based reading.",
    topics: ["ace_spectrum", "demi", "gray_ace", "aromantic"],
    accent: "accent",
  },
  {
    slug: "lgbtq-affirming-intimacy",
    title: "LGBTQ+ affirming intimacy",
    blurb:
      "Affirming care and intimacy for lesbian, gay, bisexual, pansexual, queer, trans, non-binary, and intersex people.",
    topics: ["lgbtq", "lesbian", "gay", "bi_pan", "queer", "trans_affirming_care", "intersex", "coming_out"],
    accent: "coral",
  },
  {
    slug: "reigniting-desire",
    title: "Reigniting desire",
    blurb:
      "Responsive desire, desire discrepancy, and the dual-control model — gentle, practical science for couples in a rut.",
    topics: ["low_desire", "desire_discrepancy", "willingness", "sexless_relationships", "arousal_disorders"],
    accent: "accent",
  },
  {
    slug: "healing-after-trauma",
    title: "Healing after trauma",
    blurb:
      "Rebuilding safety and intimacy after sexual trauma, with shame, guilt, and body-image work woven in.",
    topics: ["sexual_trauma", "religious_shame", "guilt", "body_image"],
    accent: "coral",
  },
  {
    slug: "couples-connection",
    title: "Couples & connection",
    blurb:
      "Attachment, communication, and repair — from everyday friction to recovering after an affair.",
    topics: [
      "couple_counselling",
      "attachment_styles",
      "communication_breakdown",
      "emotional_rupture",
      "infidelity_recovery",
    ],
    accent: "accent",
  },
  {
    slug: "ethical-non-monogamy",
    title: "Open & ethical non-monogamy",
    blurb:
      "Open relationships, polyamory, swinging, and relationship anarchy — research on what helps these structures thrive.",
    topics: ["open_relationships", "polyamory", "swinging", "relationship_anarchy"],
    accent: "coral",
  },
  {
    slug: "bodies-and-life-stages",
    title: "Bodies & life stages",
    blurb:
      "Sexual wellbeing through postpartum, perimenopause, aging, cancer survivorship, and chronic illness.",
    topics: [
      "postpartum",
      "perimenopause",
      "pregnancy",
      "aging",
      "cancer_survivorship",
      "diabetes",
      "cardiovascular",
      "ms",
    ],
    accent: "accent",
  },
  {
    slug: "intimacy-and-disability",
    title: "Intimacy & disability",
    blurb:
      "Affirming sexuality and intimacy for disabled, autistic, and neurodivergent people.",
    topics: ["disability", "autism", "adhd"],
    accent: "coral",
  },
];

export function collectionBySlug(slug: string): Collection | undefined {
  return COLLECTIONS.find((c) => c.slug === slug);
}

/** Human label for a topic slug (falls back to a humanised slug). */
export function topicLabel(slug: string): string {
  return (TOPICS as Record<string, string>)[slug] ?? slug.replace(/_/g, " ");
}

/** True when a tag slug is a first-class taxonomy topic (vs population/modality). */
export function isTopicTag(slug: string): slug is Topic {
  return Object.prototype.hasOwnProperty.call(TOPICS, slug);
}

type WithTags = { tagNames: string[] };

/** Items belonging to a collection: any item carrying one of its topic tags. */
export function collectionItems<T extends WithTags>(items: T[], c: Collection): T[] {
  const want = new Set<string>(c.topics);
  return items.filter((it) => it.tagNames.some((t) => want.has(t)));
}
