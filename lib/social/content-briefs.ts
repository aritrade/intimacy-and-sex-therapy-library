/**
 * Curated content-brief library for the daily content engine.
 *
 * The cron at /api/cron/daily-generate picks N briefs/day from this
 * pool, prefers ones we haven't run recently, and rotates language +
 * style to keep the channels visually varied.
 *
 * Each brief is intentionally specific (not "talk about desire") so
 * the LLM produces a focused script instead of a generic essay. The
 * whole pool maps onto the catalog's topic taxonomy, so every script
 * has a corresponding read-more page on the site.
 */

export type ContentBrief = {
  id: string;
  brief: string;
  topicSlug: string;
  /**
   * Hint for the renderer — these briefs work better in some styles
   * than others (e.g. quotes shine in carousel; essays need depth).
   * The cron will respect this when picking; if undefined, any style.
   */
  preferredStyles?: Array<"typography" | "stock" | "carousel" | "long_form_essay">;
  /**
   * If set, the cron will try to pull a published resource with this
   * topic and pass it as the citation source for the script.
   */
  citationTopic?: string;
};

export const CONTENT_BRIEFS: ContentBrief[] = [
  {
    id: "responsive-vs-spontaneous-desire",
    brief:
      "A 60s reel explaining responsive desire vs spontaneous desire. Beginner audience. Gender-neutral.",
    topicSlug: "low-desire",
    preferredStyles: ["typography", "stock", "carousel"],
    citationTopic: "low-desire",
  },
  {
    id: "dual-control-model",
    brief:
      "A 60s reel on the dual-control model — 'brakes' and 'accelerator' — and why context matters more than libido pills. Cite Bancroft & Janssen if a source is supplied.",
    topicSlug: "low-desire",
    preferredStyles: ["typography", "stock"],
    citationTopic: "low-desire",
  },
  {
    id: "sensate-focus-explainer",
    brief:
      "A 60s reel introducing sensate focus as a clinician-recommended exercise for couples experiencing pressure or low arousal. Reframe the goal from 'orgasm' to 'attention'.",
    topicSlug: "couples-counselling",
    preferredStyles: ["stock", "long_form_essay"],
    citationTopic: "couples-counselling",
  },
  {
    id: "vaginismus-myths",
    brief:
      "A 60s reel busting three myths about vaginismus. Affirm that it's involuntary, common, and treatable. Avoid pathologising language.",
    topicSlug: "vaginismus",
    preferredStyles: ["typography", "carousel"],
    citationTopic: "vaginismus",
  },
  {
    id: "performance-anxiety-loop",
    brief:
      "A 60s reel on the performance-anxiety loop in erection difficulties. Explain the role of arousal-attention vs spectatoring. Soft, validating tone.",
    topicSlug: "erectile-difficulties",
    preferredStyles: ["typography", "stock"],
    citationTopic: "erectile-difficulties",
  },
  {
    id: "asexual-affirming",
    brief:
      "A 60s reel that affirms asexuality is an orientation, not a disorder. Reference the AASECT 2016 position. Warm, gentle, non-instructional.",
    topicSlug: "asexual-spectrum",
    preferredStyles: ["typography", "carousel"],
    citationTopic: "asexual-spectrum",
  },
  {
    id: "lgbtq-couples-therapy",
    brief:
      "A 60s reel on what an affirming therapist looks like for LGBTQ+ couples. Emphasise scope-of-practice and how to vet a clinician.",
    topicSlug: "lgbtq-affirmative",
    preferredStyles: ["stock", "long_form_essay"],
    citationTopic: "lgbtq-affirmative",
  },
  {
    id: "trauma-and-touch",
    brief:
      "A 60s reel introducing 'window of tolerance' for trauma survivors approaching intimacy. Emphasise pacing and consent.",
    topicSlug: "trauma",
    preferredStyles: ["typography", "stock", "carousel"],
    citationTopic: "trauma",
  },
  {
    id: "porn-distress-context",
    brief:
      "A 60s reel reframing 'porn-related distress' — the distress is real even when the behaviour is not pathological by clinical criteria. Avoid moralising.",
    topicSlug: "porn-related-distress",
    preferredStyles: ["typography"],
    citationTopic: "porn-related-distress",
  },
  {
    id: "consent-is-ongoing",
    brief:
      "A 60s carousel with five slides on what ongoing consent looks like inside a long-term relationship. Each slide is one practice.",
    topicSlug: "consent",
    preferredStyles: ["carousel"],
  },
  {
    id: "open-relationships-vocab",
    brief:
      "A 60s reel that introduces the difference between polyamory, ENM, and swinging — vocabulary, not advocacy. Neutral tone.",
    topicSlug: "open-relationships",
    preferredStyles: ["typography", "long_form_essay"],
    citationTopic: "open-relationships",
  },
  {
    id: "postpartum-libido",
    brief:
      "A 60s reel on the typical postpartum libido timeline and why couples should normalise low desire for 6–12 months. Cite ACOG postpartum guidance.",
    topicSlug: "postpartum",
    preferredStyles: ["stock", "carousel"],
    citationTopic: "postpartum",
  },
  {
    id: "what-is-sex-therapy",
    brief:
      "A 2-minute detailed explainer answering 'what actually happens in sex therapy'. Walk the listener through what a first session looks like minute-by-minute, address the 'no nudity, no touching, just talking' fear with specifics, and list four questions to ask a prospective therapist. Use real, grounded language — never vague generalities.",
    topicSlug: "what-is-sex-therapy",
    preferredStyles: ["long_form_essay"],
  },
  {
    id: "desire-discrepancy-essay",
    brief:
      "A 2-minute detailed explainer on desire discrepancy in long-term couples. Distinguish 'low desire' from 'lower desire than your partner', explain why the gap usually has nothing to do with attraction, walk through one practical reframe the couple can try this week, and close with what to do when the gap persists. No fixes promised — just reframes.",
    topicSlug: "low-desire",
    preferredStyles: ["long_form_essay"],
    citationTopic: "low-desire",
  },
  {
    id: "shame-cycle-essay",
    brief:
      "A 2-minute detailed explainer on the shame-withdraw cycle in long-term relationships. Open with what shame feels like in the body during conflict, draw Brené Brown's distinction between guilt and shame, describe the four-step loop (trigger → shame → withdraw → distance), and offer one concrete repair move. End with a single question the listener can ask their partner tonight.",
    topicSlug: "shame-and-guilt",
    preferredStyles: ["long_form_essay"],
  },
  {
    id: "responsive-desire-deep-dive",
    brief:
      "A 2-minute detailed explainer on responsive desire — desire that shows up AFTER touch begins, not before. Explain the difference from spontaneous desire, why the responsive pattern is normal and especially common in long-term partnerships, what 'context' means (stress, fatigue, resentment, safety), and one small ritual a couple can use to invite responsive desire without pressure.",
    topicSlug: "low-desire",
    preferredStyles: ["long_form_essay"],
    citationTopic: "low-desire",
  },
  {
    id: "emotional-intimacy-rebuild",
    brief:
      "A 2-minute detailed explainer on rebuilding emotional intimacy after a season of distance. Define emotional intimacy in concrete behaviours (not abstract feelings), explain why distance accumulates without anyone meaning it to, walk through the 'turning toward' research from John Gottman, and give the listener two micro-practices they can start tonight without a long conversation.",
    topicSlug: "couples-counselling",
    preferredStyles: ["long_form_essay"],
    citationTopic: "couples-counselling",
  },
  {
    id: "arousal-non-concordance-explainer",
    brief:
      "A 2-minute detailed explainer on arousal non-concordance — the often surprising disconnect between physical arousal and felt desire. Cover the science clearly (Emily Nagoski's work), explain why this matters for consent and for self-trust, address why women's bodies and minds particularly often signal differently, and reassure the listener that this is normal physiology, not dysfunction.",
    topicSlug: "low-desire",
    preferredStyles: ["long_form_essay"],
    citationTopic: "low-desire",
  },
  {
    id: "pain-during-sex-explainer",
    brief:
      "A 2-minute detailed explainer on pain during sex (dyspareunia) for anyone who has been told 'it's all in your head' or to 'just relax'. Validate that pain is real and has dozens of physiological causes, walk through the kinds of clinicians to see in what order (gynaecologist, pelvic-floor physio, sex therapist), and give the listener language to advocate for themselves at appointments. Never minimise. Never prescribe.",
    topicSlug: "vaginismus",
    preferredStyles: ["long_form_essay"],
    citationTopic: "vaginismus",
  },
  {
    id: "sleeping-apart-myth-explainer",
    brief:
      "A 2-minute detailed explainer on the myth that 'happy couples always share a bed'. Walk through why sleep divorce is a calm, research-grounded practice (not a sign of trouble), what couples actually report after trying it, the difference between physical and emotional intimacy, and how partners can still protect closeness rituals — morning coffee, weekend mornings, shared bedtimes that aren't shared sleep.",
    topicSlug: "couples-counselling",
    preferredStyles: ["long_form_essay"],
  },
];

export function pickBriefsForToday(opts: {
  date: Date;
  shortFormCount: number;
  longFormCount: number;
  recentlyUsedIds: Set<string>;
}): {
  shortForm: ContentBrief[];
  longForm: ContentBrief[];
} {
  const longCandidates = CONTENT_BRIEFS.filter(
    (b) => b.preferredStyles?.includes("long_form_essay") ?? false,
  );
  const shortCandidates = CONTENT_BRIEFS.filter(
    (b) => !b.preferredStyles || b.preferredStyles.some((s) => s !== "long_form_essay"),
  );

  // Deterministic seed based on date so multiple cron retries pick the same set.
  const seed = opts.date.getUTCFullYear() * 10000 + (opts.date.getUTCMonth() + 1) * 100 + opts.date.getUTCDate();
  const sortByFreshness = (a: ContentBrief, b: ContentBrief) => {
    const aUsed = opts.recentlyUsedIds.has(a.id) ? 1 : 0;
    const bUsed = opts.recentlyUsedIds.has(b.id) ? 1 : 0;
    if (aUsed !== bUsed) return aUsed - bUsed;
    return mulberry32(seed + hash(a.id))() - mulberry32(seed + hash(b.id))();
  };

  return {
    shortForm: [...shortCandidates].sort(sortByFreshness).slice(0, opts.shortFormCount),
    longForm: [...longCandidates].sort(sortByFreshness).slice(0, opts.longFormCount),
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let t = seed;
  return function () {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
