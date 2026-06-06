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
 *
 * Authoring conventions (apply to ANY new brief you add):
 *
 *   1. Don't bake the duration into the brief copy ("a 60s reel…").
 *      The cron passes the target duration to the script-generator's
 *      system prompt; the brief should be duration-agnostic so the
 *      same brief can be rendered at 30s today and 60s tomorrow if
 *      we change the env. Use phrases like "A short-form reel" or
 *      "A detailed long-form explainer" instead.
 *   2. Be specific. "Reframe responsive desire" beats "talk about
 *      desire" — the LLM picks up specificity and runs with it.
 *   3. Stay clinician-safe. No diagnosis, no medical dosing, no
 *      pathologising. Sex-positive, LGBTQ+ and asexual-affirming.
 *   4. Prefer one concrete, partner-friendly action per brief — the
 *      rendered script lands better when there's a takeaway.
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
      "A short-form reel explaining responsive desire vs spontaneous desire. Beginner audience. Gender-neutral.",
    topicSlug: "low-desire",
    preferredStyles: ["typography", "stock", "carousel"],
    citationTopic: "low-desire",
  },
  {
    id: "dual-control-model",
    brief:
      "A short-form reel on the dual-control model — 'brakes' and 'accelerator' — and why context matters more than libido pills. Cite Bancroft & Janssen if a source is supplied.",
    topicSlug: "low-desire",
    preferredStyles: ["typography", "stock"],
    citationTopic: "low-desire",
  },
  {
    id: "sensate-focus-explainer",
    brief:
      "A short-form reel introducing sensate focus as a clinician-recommended exercise for couples experiencing pressure or low arousal. Reframe the goal from 'orgasm' to 'attention'.",
    topicSlug: "couples-counselling",
    preferredStyles: ["stock", "long_form_essay"],
    citationTopic: "couples-counselling",
  },
  {
    id: "vaginismus-myths",
    brief:
      "A short-form reel busting three myths about vaginismus. Affirm that it's involuntary, common, and treatable. Avoid pathologising language.",
    topicSlug: "vaginismus",
    preferredStyles: ["typography", "carousel"],
    citationTopic: "vaginismus",
  },
  {
    id: "performance-anxiety-loop",
    brief:
      "A short-form reel on the performance-anxiety loop in erection difficulties. Explain the role of arousal-attention vs spectatoring. Soft, validating tone.",
    topicSlug: "erectile-difficulties",
    preferredStyles: ["typography", "stock"],
    citationTopic: "erectile-difficulties",
  },
  {
    id: "asexual-affirming",
    brief:
      "A short-form reel that affirms asexuality is an orientation, not a disorder. Reference the AASECT 2016 position. Warm, gentle, non-instructional.",
    topicSlug: "asexual-spectrum",
    preferredStyles: ["typography", "carousel"],
    citationTopic: "asexual-spectrum",
  },
  {
    id: "lgbtq-couples-therapy",
    brief:
      "A short-form reel on what an affirming therapist looks like for LGBTQ+ couples. Emphasise scope-of-practice and how to vet a clinician.",
    topicSlug: "lgbtq-affirmative",
    preferredStyles: ["stock", "long_form_essay"],
    citationTopic: "lgbtq-affirmative",
  },
  {
    id: "trauma-and-touch",
    brief:
      "A short-form reel introducing 'window of tolerance' for trauma survivors approaching intimacy. Emphasise pacing and consent.",
    topicSlug: "trauma",
    preferredStyles: ["typography", "stock", "carousel"],
    citationTopic: "trauma",
  },
  {
    id: "porn-distress-context",
    brief:
      "A short-form reel reframing 'porn-related distress' — the distress is real even when the behaviour is not pathological by clinical criteria. Avoid moralising.",
    topicSlug: "porn-related-distress",
    preferredStyles: ["typography"],
    citationTopic: "porn-related-distress",
  },
  {
    id: "consent-is-ongoing",
    brief:
      "A short-form carousel with five slides on what ongoing consent looks like inside a long-term relationship. Each slide is one practice.",
    topicSlug: "consent",
    preferredStyles: ["carousel"],
  },
  {
    id: "open-relationships-vocab",
    brief:
      "A short-form reel that introduces the difference between polyamory, ENM, and swinging — vocabulary, not advocacy. Neutral tone.",
    topicSlug: "open-relationships",
    preferredStyles: ["typography", "long_form_essay"],
    citationTopic: "open-relationships",
  },
  {
    id: "postpartum-libido",
    brief:
      "A short-form reel on the typical postpartum libido timeline and why couples should normalise low desire for 6–12 months. Cite ACOG postpartum guidance.",
    topicSlug: "postpartum",
    preferredStyles: ["stock", "carousel"],
    citationTopic: "postpartum",
  },
  {
    id: "what-is-sex-therapy",
    brief:
      "A detailed explainer answering 'what actually happens in sex therapy'. Walk the listener through what a first session looks like minute-by-minute, address the 'no nudity, no touching, just talking' fear with specifics, and list four questions to ask a prospective therapist. Use real, grounded language — never vague generalities.",
    topicSlug: "what-is-sex-therapy",
    preferredStyles: ["long_form_essay"],
  },
  {
    id: "desire-discrepancy-essay",
    brief:
      "A detailed explainer on desire discrepancy in long-term couples. Distinguish 'low desire' from 'lower desire than your partner', explain why the gap usually has nothing to do with attraction, walk through one practical reframe the couple can try this week, and close with what to do when the gap persists. No fixes promised — just reframes.",
    topicSlug: "low-desire",
    preferredStyles: ["long_form_essay"],
    citationTopic: "low-desire",
  },
  {
    id: "shame-cycle-essay",
    brief:
      "A detailed explainer on the shame-withdraw cycle in long-term relationships. Open with what shame feels like in the body during conflict, draw Brené Brown's distinction between guilt and shame, describe the four-step loop (trigger → shame → withdraw → distance), and offer one concrete repair move. End with a single question the listener can ask their partner tonight.",
    topicSlug: "shame-and-guilt",
    preferredStyles: ["long_form_essay"],
  },
  {
    id: "responsive-desire-deep-dive",
    brief:
      "A detailed explainer on responsive desire — desire that shows up AFTER touch begins, not before. Explain the difference from spontaneous desire, why the responsive pattern is normal and especially common in long-term partnerships, what 'context' means (stress, fatigue, resentment, safety), and one small ritual a couple can use to invite responsive desire without pressure.",
    topicSlug: "low-desire",
    preferredStyles: ["long_form_essay"],
    citationTopic: "low-desire",
  },
  {
    id: "emotional-intimacy-rebuild",
    brief:
      "A detailed explainer on rebuilding emotional intimacy after a season of distance. Define emotional intimacy in concrete behaviours (not abstract feelings), explain why distance accumulates without anyone meaning it to, walk through the 'turning toward' research from John Gottman, and give the listener two micro-practices they can start tonight without a long conversation.",
    topicSlug: "couples-counselling",
    preferredStyles: ["long_form_essay"],
    citationTopic: "couples-counselling",
  },
  {
    id: "arousal-non-concordance-explainer",
    brief:
      "A detailed explainer on arousal non-concordance — the often surprising disconnect between physical arousal and felt desire. Cover the science clearly (Emily Nagoski's work), explain why this matters for consent and for self-trust, address why women's bodies and minds particularly often signal differently, and reassure the listener that this is normal physiology, not dysfunction.",
    topicSlug: "low-desire",
    preferredStyles: ["long_form_essay"],
    citationTopic: "low-desire",
  },
  {
    id: "pain-during-sex-explainer",
    brief:
      "A detailed explainer on pain during sex (dyspareunia) for anyone who has been told 'it's all in your head' or to 'just relax'. Validate that pain is real and has dozens of physiological causes, walk through the kinds of clinicians to see in what order (gynaecologist, pelvic-floor physio, sex therapist), and give the listener language to advocate for themselves at appointments. Never minimise. Never prescribe.",
    topicSlug: "vaginismus",
    preferredStyles: ["long_form_essay"],
    citationTopic: "vaginismus",
  },
  {
    id: "sleeping-apart-myth-explainer",
    brief:
      "A detailed explainer on the myth that 'happy couples always share a bed'. Walk through why sleep divorce is a calm, research-grounded practice (not a sign of trouble), what couples actually report after trying it, the difference between physical and emotional intimacy, and how partners can still protect closeness rituals — morning coffee, weekend mornings, shared bedtimes that aren't shared sleep.",
    topicSlug: "couples-counselling",
    preferredStyles: ["long_form_essay"],
  },

  // ---------------------------------------------------------------
  // Short-form additions — broader topical variety
  // ---------------------------------------------------------------
  {
    id: "communication-ask-for-touch",
    brief:
      "A short-form carousel with five slides on phrases people can use to ask for the kind of touch they want. Lead with sentence-starters, not commands. Examples that reduce defensiveness (e.g., 'I noticed I really liked it when…'). Inclusive, gender-neutral throughout.",
    topicSlug: "communication",
    preferredStyles: ["carousel"],
  },
  {
    id: "orgasm-gap-priorities",
    brief:
      "A short-form reel reframing the orgasm gap between cisgender heterosexual partners as a question of priorities and learning, not biology. Reference the well-established research finding without making clinical claims, and offer one concrete shift partners can try this week.",
    topicSlug: "orgasm-gap",
    preferredStyles: ["typography", "stock"],
  },
  {
    id: "mindfulness-anchors-during-sex",
    brief:
      "A short-form reel offering three sensory anchors when the mind drifts during intimacy: breath, weight, contact. Each is one practice in one sentence. Calm, non-instructional tone.",
    topicSlug: "mindfulness-intimacy",
    preferredStyles: ["stock", "typography"],
  },
  {
    id: "ssri-libido-conversation",
    brief:
      "A short-form reel on the conversation to have with your psychiatrist if antidepressants have changed your libido. Frame as 'what to ask' not 'what to do' — never skip or alter medication without clinical guidance. Validate that this is common and discussable.",
    topicSlug: "medication-and-desire",
    preferredStyles: ["stock", "typography"],
  },
  {
    id: "pelvic-floor-not-just-kegels",
    brief:
      "A short-form reel on why 'just do your kegels' is incomplete advice. Some pelvic-floor symptoms come from over-tight muscles where strengthening makes it worse — emphasise seeing a pelvic-floor physiotherapist for assessment first. Validate, do not diagnose.",
    topicSlug: "pelvic-floor",
    preferredStyles: ["stock"],
  },
  {
    id: "anxiety-grounding-in-bed",
    brief:
      "A short-form carousel walking through the 5-4-3-2-1 grounding technique when arousal collapses into anxiety mid-act. Five slides, one sense each, calm typography. Add one closing slide: this isn't failure, it's information.",
    topicSlug: "performance-anxiety",
    preferredStyles: ["carousel"],
  },
  {
    id: "pregnancy-loss-reapproaching-intimacy",
    brief:
      "A short-form reel for couples re-approaching intimacy after pregnancy loss. Validate that grief and desire are not opposites; offer one concrete pacing tool. Avoid platitudes. Sensitive, clinician-grounded language throughout.",
    topicSlug: "pregnancy-loss",
    preferredStyles: ["stock"],
  },
  {
    id: "premature-ejaculation-treatable",
    brief:
      "A short-form reel that affirms premature ejaculation is common and highly treatable through behavioural techniques. Mention start-stop and squeeze methods by name without prescribing. End with: see a sex therapist or urologist for individualised care.",
    topicSlug: "premature-ejaculation",
    preferredStyles: ["typography", "stock"],
  },
  {
    id: "anorgasmia-felt-arousal-shift",
    brief:
      "A short-form reel reframing anorgasmia. Move the goal from 'reach orgasm' to 'follow felt arousal'. The reframe alone reduces pressure for many people. Validate that this is more common than spoken about and that working with a sex therapist often helps.",
    topicSlug: "anorgasmia",
    preferredStyles: ["typography"],
  },
  {
    id: "perimenopause-desire-shifts",
    brief:
      "A short-form reel on how desire shifts (not ends) in perimenopause. Name the three shifts most people report: spontaneous → responsive, vaginal dryness, sleep-driven exhaustion. Encourage talking to a gynaecologist, not just searching online.",
    topicSlug: "perimenopause",
    preferredStyles: ["stock"],
  },
  {
    id: "aftercare-for-everyone",
    brief:
      "A short-form carousel adapting kink-community 'aftercare' for any couple. Five slides: water, blanket, soft contact, one minute of held silence, one sentence of appreciation. Affirm that aftercare is intimacy, not just recovery.",
    topicSlug: "intimacy-rituals",
    preferredStyles: ["carousel"],
  },
  {
    id: "boundaries-vs-rules",
    brief:
      "A short-form carousel distinguishing boundaries (what I will do) from rules (what you must do). Five slides with concrete, non-shaming examples. Affirm that healthy boundaries are about the self, not control of the partner.",
    topicSlug: "boundaries",
    preferredStyles: ["carousel"],
  },
  {
    id: "indian-wedding-night-pressure",
    brief:
      "A short-form reel addressing wedding-night anxiety in the Indian context. Validate that newlywed couples often need months — not minutes — to find their rhythm. Counter the 'consummation tonight' pressure without disrespecting tradition. Warm, non-judgmental.",
    topicSlug: "india-context",
    preferredStyles: ["stock", "typography"],
  },
  {
    id: "men-emotional-equals-sexual",
    brief:
      "A short-form reel for men: emotional intimacy IS sexual intimacy. Reframe the false split between 'feelings work' and 'sex work' in a relationship. Reference Gottman's bid-for-connection research without overclaiming.",
    topicSlug: "men-and-intimacy",
    preferredStyles: ["typography"],
  },
  {
    id: "consent-mid-act-checkin",
    brief:
      "A short-form carousel on how to check in mid-act without killing the mood. Five slides: a glance, a single-word check, a slow pause, a 'still good?' whisper, and the one rule — believe the answer. Affirm that the most attentive lovers are the safest.",
    topicSlug: "consent",
    preferredStyles: ["carousel"],
  },

  // ---------------------------------------------------------------
  // Long-form additions — broader topical variety
  // ---------------------------------------------------------------
  {
    id: "postpartum-desire-timeline-essay",
    brief:
      "A detailed explainer walking through the postpartum desire timeline by phase: months 0-3 (recovery), 3-6 (re-emergence often slower than expected), 6-12 (responsive desire usually returns with sleep), 12+ (when to consult a clinician). Validate that low desire here is normal and not a relationship verdict. Reference ACOG postpartum guidance without overclaiming.",
    topicSlug: "postpartum",
    preferredStyles: ["long_form_essay"],
    citationTopic: "postpartum",
  },
  {
    id: "affair-recovery-architecture-essay",
    brief:
      "A detailed explainer on the architecture of repair after infidelity. Walk through the four phases that show up consistently in couples therapy: discovery, emergency stabilisation, meaning-making, rebuilding. Draw lightly on Esther Perel and the Gottman repair literature. Make clear: most couples need a clinician, not a podcast.",
    topicSlug: "infidelity-recovery",
    preferredStyles: ["long_form_essay"],
  },
  {
    id: "coming-out-later-life-essay",
    brief:
      "A detailed explainer on coming out later in life — in one's 40s, 50s, 60s. Describe the 'second adolescence' so people don't pathologise their own joy or grief. Address what to say to a long-term partner, finding therapists who actually get it, and the importance of community. Affirming throughout.",
    topicSlug: "coming-out",
    preferredStyles: ["long_form_essay"],
  },
  {
    id: "four-horsemen-intimacy-essay",
    brief:
      "A detailed explainer applying Gottman's four horsemen — criticism, contempt, defensiveness, stonewalling — to the bedroom. One concrete bedroom example each, then the antidote (gentle start-up, fondness map, take responsibility, physiological self-soothing). Reference Gottman without overclaiming and end with one practice for tonight.",
    topicSlug: "couples-counselling",
    preferredStyles: ["long_form_essay"],
    citationTopic: "couples-counselling",
  },
  {
    id: "perimenopause-clinical-primer-essay",
    brief:
      "A detailed clinical primer on perimenopause and intimacy. Cover the hormonal shifts at a high level, the role of vaginal lubrication and what kinds work, the conversation to have with your gynaecologist about hormonal options (without prescribing), and the equally important non-hormonal pieces — sleep, stress, partnership communication. Validate, never minimise.",
    topicSlug: "perimenopause",
    preferredStyles: ["long_form_essay"],
  },
  {
    id: "disability-pleasure-essay",
    brief:
      "A detailed explainer affirming disabled people's right to pleasure. Counter the 'asexual by default' myth that the medical system often imposes. Practical adaptations (positions, props, pacing), the language to use with partners and clinicians, and the difference between accommodating and assuming. Lead with affirmation, not pity.",
    topicSlug: "disability-and-intimacy",
    preferredStyles: ["long_form_essay"],
  },
  {
    id: "ssri-decisional-framework-essay",
    brief:
      "A detailed explainer on antidepressants and sexual functioning. The decisional framework: when to talk to your psychiatrist (always), what to ask (alternatives, dose timing, augmentation), and what to talk about with your partner first (the experience, not the prescription). Be explicit: never alter or skip medication based on a video — bring it to your prescribing clinician.",
    topicSlug: "medication-and-desire",
    preferredStyles: ["long_form_essay"],
  },
  {
    id: "faith-and-intimacy-india-essay",
    brief:
      "A detailed explainer holding both faith and a sexually integrated self in the Indian context. Acknowledge the real tension; offer three frames that help — pleasure as gratitude (drawing on the broader Indian textual tradition without proselytising), the difference between cultural conditioning and faith itself, and the quiet permission of clinician-affirmed Indian sex therapists. Respectful of every tradition; pathologises none.",
    topicSlug: "india-context",
    preferredStyles: ["long_form_essay"],
  },
  {
    id: "premature-ejaculation-clinical-essay",
    brief:
      "A detailed clinical explainer on premature ejaculation that goes beyond 'last longer' tips. Cover the neurobiology briefly, the partner-included treatment frame (it's a couple's project, not a flaw), behavioural techniques (start-stop, squeeze) by name, and the off-label SSRI conversation that should happen with a urologist or psychiatrist — never self-prescribe. End on hope: highly treatable.",
    topicSlug: "premature-ejaculation",
    preferredStyles: ["long_form_essay"],
  },
  {
    id: "attachment-bedroom-essay",
    brief:
      "A detailed explainer on how anxious and avoidant attachment patterns show up in the bedroom — the chase-pursue-withdraw loop, the 'I want closeness but freeze when I get it' bind, the partner who reads bids as demands. Offer two repair scripts each side can try, and the clinical literacy that this is patterns, not pathology.",
    topicSlug: "attachment",
    preferredStyles: ["long_form_essay"],
  },
];

/**
 * Full freshness-ordered candidate lists, split by form. The first N of
 * each are today's picks; the remainder serve as backups the daily cron
 * draws on to top up when a pick fails or is refused (so the day still
 * lands the full short+long quota). Deterministic per UTC date so retries
 * are stable.
 */
export function orderedBriefs(opts: {
  date: Date;
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
    shortForm: [...shortCandidates].sort(sortByFreshness),
    longForm: [...longCandidates].sort(sortByFreshness),
  };
}

export function pickBriefsForToday(opts: {
  date: Date;
  shortFormCount: number;
  longFormCount: number;
  recentlyUsedIds: Set<string>;
}): {
  shortForm: ContentBrief[];
  longForm: ContentBrief[];
} {
  const ordered = orderedBriefs({ date: opts.date, recentlyUsedIds: opts.recentlyUsedIds });
  return {
    shortForm: ordered.shortForm.slice(0, opts.shortFormCount),
    longForm: ordered.longForm.slice(0, opts.longFormCount),
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
