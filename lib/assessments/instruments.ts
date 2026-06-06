/**
 * Public-domain assessment instruments.
 *
 * IMPORTANT — licensing:
 *   - PHQ-9: Pfizer released for free use, no permission required.
 *   - GAD-7: same authors, same release terms.
 *   - NSSS-S (New Sexual Satisfaction Scale, Short Form, Štulhofer et al. 2010):
 *     publicly available with the authors' encouragement to use it.
 *
 * NOT included (require licensing — see /assessments page for "Available after
 * licensing"):
 *   - FSFI (Female Sexual Function Index)
 *   - IIEF-5 / SHIM (International Index of Erectile Function — short form)
 *   - GRISS (Golombok-Rust Inventory of Sexual Satisfaction)
 *   - FSDS-R (Female Sexual Distress Scale, Revised)
 *
 * Scoring functions return { rawScore, severity, interpretation, flag }.
 * `flag` ∈ {"safe", "monitor", "clinician_recommended", "urgent"} drives UI
 * (e.g., the urgent flag triggers crisis-resource surfacing for PHQ-9 item 9).
 */

import type { ScoringConfig } from "./scoring";

export type AssessmentId =
  | "phq9"
  | "gad7"
  | "nsss-s"
  | "phq2"
  | "gad2"
  | "who5"
  | "pss10"
  | "pcl5"
  | "auditc"
  | "csi4"
  | "ras"
  | "asex";

/** Top-level domain used for grouping and the triage router. */
export type AssessmentCategory =
  | "mood"
  | "anxiety"
  | "stress"
  | "trauma"
  | "substance"
  | "wellbeing"
  | "relationship"
  | "sexual";

export type LikertOption = { label: string; value: number };

export type Item = {
  id: string;
  prompt: string;
  hint?: string;
  options: LikertOption[];
  /** PHQ-9 item 9 = self-harm signal */
  isCrisisSignal?: boolean;
};

export type Instrument = {
  id: AssessmentId;
  name: string;
  shortName: string;
  description: string;
  prompt: string; // shown above the items
  attribution: string;
  license: "public_domain" | "free_for_use";
  citation: string;
  items: Item[];
  /** Domain used for grouping on the hub and by the triage router. */
  category?: AssessmentCategory;
  /** Rough completion time, in minutes, shown on cards. */
  estMinutes?: number;
  /** Declarative scoring (omitted for the three bespoke-scored instruments). */
  scoring?: ScoringConfig;
};

const PHQ9_OPTIONS: LikertOption[] = [
  { label: "Not at all", value: 0 },
  { label: "Several days", value: 1 },
  { label: "More than half the days", value: 2 },
  { label: "Nearly every day", value: 3 },
];

export const PHQ9: Instrument = {
  id: "phq9",
  category: "mood",
  estMinutes: 3,
  name: "PHQ-9 — Patient Health Questionnaire",
  shortName: "PHQ-9",
  description:
    "A 9-item screen for depression. Widely used in primary care globally and in India.",
  prompt:
    "Over the last 2 weeks, how often have you been bothered by any of the following problems?",
  attribution: "Kroenke, Spitzer, Williams (2001) · Pfizer · public-domain",
  license: "public_domain",
  citation:
    "Kroenke K, Spitzer RL, Williams JB. The PHQ-9: validity of a brief depression severity measure. J Gen Intern Med. 2001;16(9):606-13.",
  items: [
    { id: "phq9-1", prompt: "Little interest or pleasure in doing things", options: PHQ9_OPTIONS },
    { id: "phq9-2", prompt: "Feeling down, depressed, or hopeless", options: PHQ9_OPTIONS },
    { id: "phq9-3", prompt: "Trouble falling/staying asleep, or sleeping too much", options: PHQ9_OPTIONS },
    { id: "phq9-4", prompt: "Feeling tired or having little energy", options: PHQ9_OPTIONS },
    { id: "phq9-5", prompt: "Poor appetite or overeating", options: PHQ9_OPTIONS },
    {
      id: "phq9-6",
      prompt:
        "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
      options: PHQ9_OPTIONS,
    },
    {
      id: "phq9-7",
      prompt:
        "Trouble concentrating on things, such as reading the newspaper or watching television",
      options: PHQ9_OPTIONS,
    },
    {
      id: "phq9-8",
      prompt:
        "Moving or speaking so slowly that other people could have noticed — or being so fidgety/restless that you have been moving around a lot more than usual",
      options: PHQ9_OPTIONS,
    },
    {
      id: "phq9-9",
      prompt:
        "Thoughts that you would be better off dead, or thoughts of hurting yourself in some way",
      options: PHQ9_OPTIONS,
      isCrisisSignal: true,
    },
  ],
};

const GAD7_OPTIONS: LikertOption[] = [...PHQ9_OPTIONS];

export const GAD7: Instrument = {
  id: "gad7",
  category: "anxiety",
  estMinutes: 2,
  name: "GAD-7 — Generalized Anxiety Disorder",
  shortName: "GAD-7",
  description: "A 7-item screen for generalized anxiety disorder.",
  prompt:
    "Over the last 2 weeks, how often have you been bothered by the following problems?",
  attribution: "Spitzer, Kroenke, Williams, Löwe (2006) · Pfizer · public-domain",
  license: "public_domain",
  citation:
    "Spitzer RL, Kroenke K, Williams JB, Löwe B. A brief measure for assessing generalized anxiety disorder: the GAD-7. Arch Intern Med. 2006;166(10):1092-7.",
  items: [
    { id: "gad7-1", prompt: "Feeling nervous, anxious, or on edge", options: GAD7_OPTIONS },
    { id: "gad7-2", prompt: "Not being able to stop or control worrying", options: GAD7_OPTIONS },
    { id: "gad7-3", prompt: "Worrying too much about different things", options: GAD7_OPTIONS },
    { id: "gad7-4", prompt: "Trouble relaxing", options: GAD7_OPTIONS },
    { id: "gad7-5", prompt: "Being so restless that it is hard to sit still", options: GAD7_OPTIONS },
    { id: "gad7-6", prompt: "Becoming easily annoyed or irritable", options: GAD7_OPTIONS },
    {
      id: "gad7-7",
      prompt: "Feeling afraid, as if something awful might happen",
      options: GAD7_OPTIONS,
    },
  ],
};

const NSSS_OPTIONS: LikertOption[] = [
  { label: "Not at all satisfied", value: 1 },
  { label: "A little satisfied", value: 2 },
  { label: "Moderately satisfied", value: 3 },
  { label: "Very satisfied", value: 4 },
  { label: "Extremely satisfied", value: 5 },
];

export const NSSS_S: Instrument = {
  id: "nsss-s",
  category: "sexual",
  estMinutes: 4,
  name: "NSSS-S — New Sexual Satisfaction Scale (Short Form)",
  shortName: "NSSS-S",
  description:
    "A 12-item, gender-neutral, partner-status-neutral measure of sexual satisfaction.",
  prompt:
    "Thinking about your sex life during the last six months, please rate your satisfaction with the following:",
  attribution: "Štulhofer, Buško, Brouillard (2010) · free for clinical and research use",
  license: "free_for_use",
  citation:
    "Štulhofer A, Buško V, Brouillard P. Development and bicultural validation of the New Sexual Satisfaction Scale. J Sex Res. 2010;47(2-3):257-68.",
  items: [
    { id: "nsss-1", prompt: "The intensity of my sexual arousal", options: NSSS_OPTIONS },
    { id: "nsss-2", prompt: "The quality of my orgasms", options: NSSS_OPTIONS },
    { id: "nsss-3", prompt: "My ‘letting go’ and surrender to sexual pleasure during sex", options: NSSS_OPTIONS },
    { id: "nsss-4", prompt: "My focus / concentration during sexual activity", options: NSSS_OPTIONS },
    { id: "nsss-5", prompt: "The way I sexually react to my partner", options: NSSS_OPTIONS },
    { id: "nsss-6", prompt: "My body’s sexual functioning", options: NSSS_OPTIONS },
    { id: "nsss-7", prompt: "My emotional opening up during sex", options: NSSS_OPTIONS },
    { id: "nsss-8", prompt: "My mood after sexual activity", options: NSSS_OPTIONS },
    { id: "nsss-9", prompt: "The frequency of my sexual activity", options: NSSS_OPTIONS },
    { id: "nsss-10", prompt: "The pleasure I provide to my partner", options: NSSS_OPTIONS },
    { id: "nsss-11", prompt: "The balance between what I give and receive in sex", options: NSSS_OPTIONS },
    { id: "nsss-12", prompt: "My partner’s sexual creativity", options: NSSS_OPTIONS },
  ],
};

// ---------------------------------------------------------------------------
// Additional license-vetted instruments (public-domain or free-for-use).
// Each carries a declarative `scoring` config encoding its OWN published
// cutoffs — we never invent thresholds.
// ---------------------------------------------------------------------------

const FREQ_0_3: LikertOption[] = [...PHQ9_OPTIONS];

export const PHQ2: Instrument = {
  id: "phq2",
  category: "mood",
  estMinutes: 1,
  name: "PHQ-2 — Depression ultra-brief screen",
  shortName: "PHQ-2",
  description: "A 2-item first-pass screen for depressed mood. A positive result points to the full PHQ-9.",
  prompt: "Over the last 2 weeks, how often have you been bothered by the following?",
  attribution: "Kroenke, Spitzer, Williams (2003) · Pfizer · public-domain",
  license: "public_domain",
  citation:
    "Kroenke K, Spitzer RL, Williams JB. The Patient Health Questionnaire-2. Med Care. 2003;41(11):1284-92.",
  items: [
    { id: "phq2-1", prompt: "Little interest or pleasure in doing things", options: FREQ_0_3 },
    { id: "phq2-2", prompt: "Feeling down, depressed, or hopeless", options: FREQ_0_3 },
  ],
  scoring: {
    kind: "symptom",
    bands: [
      { upTo: 2, severity: "negative", label: "Below screening threshold", flag: "safe", interpretation: "Your responses are below the screening threshold for depressed mood. If you'd like a fuller picture, the PHQ-9 goes deeper." },
      { upTo: 6, severity: "positive", label: "Positive screen", flag: "clinician_recommended", interpretation: "Your responses are above the screening threshold. Completing the full PHQ-9 and considering a conversation with a clinician is a reasonable next step." },
    ],
  },
};

export const GAD2: Instrument = {
  id: "gad2",
  category: "anxiety",
  estMinutes: 1,
  name: "GAD-2 — Anxiety ultra-brief screen",
  shortName: "GAD-2",
  description: "A 2-item first-pass screen for anxiety. A positive result points to the full GAD-7.",
  prompt: "Over the last 2 weeks, how often have you been bothered by the following?",
  attribution: "Kroenke, Spitzer, Williams, Löwe (2007) · Pfizer · public-domain",
  license: "public_domain",
  citation:
    "Kroenke K, Spitzer RL, Williams JB, Monahan PO, Löwe B. Anxiety disorders in primary care: the GAD-2. Ann Intern Med. 2007;146(5):317-25.",
  items: [
    { id: "gad2-1", prompt: "Feeling nervous, anxious, or on edge", options: FREQ_0_3 },
    { id: "gad2-2", prompt: "Not being able to stop or control worrying", options: FREQ_0_3 },
  ],
  scoring: {
    kind: "symptom",
    bands: [
      { upTo: 2, severity: "negative", label: "Below screening threshold", flag: "safe", interpretation: "Your responses are below the screening threshold for anxiety. The full GAD-7 can give a more detailed picture if you'd like one." },
      { upTo: 6, severity: "positive", label: "Positive screen", flag: "clinician_recommended", interpretation: "Your responses are above the screening threshold. The full GAD-7 and a conversation with a clinician may be worthwhile." },
    ],
  },
};

const WHO5_OPTIONS: LikertOption[] = [
  { label: "At no time", value: 0 },
  { label: "Some of the time", value: 1 },
  { label: "Less than half the time", value: 2 },
  { label: "More than half the time", value: 3 },
  { label: "Most of the time", value: 4 },
  { label: "All of the time", value: 5 },
];

export const WHO5: Instrument = {
  id: "who5",
  category: "wellbeing",
  estMinutes: 2,
  name: "WHO-5 — Well-Being Index",
  shortName: "WHO-5",
  description: "A short, positively-framed measure of general well-being over the past two weeks.",
  prompt: "Please indicate, for each of the five statements, which is closest to how you have been feeling over the last two weeks.",
  attribution: "WHO Collaborating Centre, Psychiatric Research Unit (1998) · free to use with attribution",
  license: "free_for_use",
  citation:
    "Topp CW, Østergaard SD, Søndergaard S, Bech P. The WHO-5 Well-Being Index: a systematic review. Psychother Psychosom. 2015;84(3):167-76.",
  items: [
    { id: "who5-1", prompt: "I have felt cheerful and in good spirits", options: WHO5_OPTIONS },
    { id: "who5-2", prompt: "I have felt calm and relaxed", options: WHO5_OPTIONS },
    { id: "who5-3", prompt: "I have felt active and vigorous", options: WHO5_OPTIONS },
    { id: "who5-4", prompt: "I woke up feeling fresh and rested", options: WHO5_OPTIONS },
    { id: "who5-5", prompt: "My daily life has been filled with things that interest me", options: WHO5_OPTIONS },
  ],
  scoring: {
    kind: "wellbeing",
    multiplier: 4,
    scoreSuffix: "%",
    bands: [
      { upTo: 28, severity: "low", label: "Low well-being", flag: "clinician_recommended", interpretation: "A score of 28% or below is the point at which screening for low mood is usually suggested. Completing the PHQ-9 and considering a clinician conversation may help." },
      { upTo: 50, severity: "reduced", label: "Reduced well-being", flag: "monitor", interpretation: "Your well-being score is on the lower side. It can be worth paying attention to rest, connection, and the things that usually lift you — and checking in again in a couple of weeks." },
      { upTo: 100, severity: "good", label: "Adequate well-being", flag: "safe", interpretation: "Your well-being score is in the healthy range. This is a snapshot of the last two weeks, not a fixed trait." },
    ],
  },
};

const PSS_OPTIONS: LikertOption[] = [
  { label: "Never", value: 0 },
  { label: "Almost never", value: 1 },
  { label: "Sometimes", value: 2 },
  { label: "Fairly often", value: 3 },
  { label: "Very often", value: 4 },
];

export const PSS10: Instrument = {
  id: "pss10",
  category: "stress",
  estMinutes: 4,
  name: "PSS-10 — Perceived Stress Scale",
  shortName: "PSS-10",
  description: "A 10-item measure of how unpredictable, uncontrollable, and overloaded life has felt this past month.",
  prompt: "In the last month, how often have you felt or thought a certain way? Answer as honestly as possible.",
  attribution: "Cohen, Kamarck, Mermelstein (1983) · free for educational and research use",
  license: "free_for_use",
  citation:
    "Cohen S, Kamarck T, Mermelstein R. A global measure of perceived stress. J Health Soc Behav. 1983;24(4):385-96.",
  items: [
    { id: "pss-1", prompt: "Been upset because of something that happened unexpectedly", options: PSS_OPTIONS },
    { id: "pss-2", prompt: "Felt unable to control the important things in your life", options: PSS_OPTIONS },
    { id: "pss-3", prompt: "Felt nervous and stressed", options: PSS_OPTIONS },
    { id: "pss-4", prompt: "Felt confident about your ability to handle your personal problems", options: PSS_OPTIONS },
    { id: "pss-5", prompt: "Felt that things were going your way", options: PSS_OPTIONS },
    { id: "pss-6", prompt: "Found that you could not cope with all the things you had to do", options: PSS_OPTIONS },
    { id: "pss-7", prompt: "Been able to control irritations in your life", options: PSS_OPTIONS },
    { id: "pss-8", prompt: "Felt that you were on top of things", options: PSS_OPTIONS },
    { id: "pss-9", prompt: "Been angered because of things that were outside of your control", options: PSS_OPTIONS },
    { id: "pss-10", prompt: "Felt difficulties were piling up so high that you could not overcome them", options: PSS_OPTIONS },
  ],
  scoring: {
    kind: "symptom",
    reverseItemIds: ["pss-4", "pss-5", "pss-7", "pss-8"],
    reverseAround: 4,
    bands: [
      { upTo: 13, severity: "low", label: "Low perceived stress", flag: "safe", interpretation: "Your perceived stress is in the lower range for the past month." },
      { upTo: 26, severity: "moderate", label: "Moderate perceived stress", flag: "monitor", interpretation: "Your perceived stress is in the moderate range. Stress-management strategies and support can help; revisit in a few weeks." },
      { upTo: 40, severity: "high", label: "High perceived stress", flag: "clinician_recommended", interpretation: "Your perceived stress is in the higher range. If this has been sustained, talking with a clinician about coping and support is reasonable." },
    ],
  },
};

const PCL5_OPTIONS: LikertOption[] = [
  { label: "Not at all", value: 0 },
  { label: "A little bit", value: 1 },
  { label: "Moderately", value: 2 },
  { label: "Quite a bit", value: 3 },
  { label: "Extremely", value: 4 },
];

export const PCL5: Instrument = {
  id: "pcl5",
  category: "trauma",
  estMinutes: 7,
  name: "PCL-5 — PTSD Checklist for DSM-5",
  shortName: "PCL-5",
  description: "A 20-item measure of post-traumatic stress symptoms in relation to a stressful or traumatic experience.",
  prompt:
    "Keeping a stressful or traumatic experience in mind, please indicate how much you have been bothered by each problem in the past month. If this feels distressing, it's okay to stop.",
  attribution: "Weathers et al. (2013) · US National Center for PTSD · public-domain",
  license: "public_domain",
  citation:
    "Weathers FW, Litz BT, Keane TM, Palmieri PA, Marx BP, Schnurr PP. The PTSD Checklist for DSM-5 (PCL-5). National Center for PTSD; 2013.",
  items: [
    { id: "pcl-1", prompt: "Repeated, disturbing, and unwanted memories of the stressful experience", options: PCL5_OPTIONS },
    { id: "pcl-2", prompt: "Repeated, disturbing dreams of the stressful experience", options: PCL5_OPTIONS },
    { id: "pcl-3", prompt: "Suddenly feeling or acting as if the experience were actually happening again", options: PCL5_OPTIONS },
    { id: "pcl-4", prompt: "Feeling very upset when something reminded you of the experience", options: PCL5_OPTIONS },
    { id: "pcl-5", prompt: "Strong physical reactions when reminded of the experience (heart pounding, trouble breathing, sweating)", options: PCL5_OPTIONS },
    { id: "pcl-6", prompt: "Avoiding memories, thoughts, or feelings related to the experience", options: PCL5_OPTIONS },
    { id: "pcl-7", prompt: "Avoiding external reminders (people, places, conversations, activities, objects, situations)", options: PCL5_OPTIONS },
    { id: "pcl-8", prompt: "Trouble remembering important parts of the experience", options: PCL5_OPTIONS },
    { id: "pcl-9", prompt: "Strong negative beliefs about yourself, other people, or the world", options: PCL5_OPTIONS },
    { id: "pcl-10", prompt: "Blaming yourself or someone else for the experience or what happened after", options: PCL5_OPTIONS },
    { id: "pcl-11", prompt: "Strong negative feelings such as fear, horror, anger, guilt, or shame", options: PCL5_OPTIONS },
    { id: "pcl-12", prompt: "Loss of interest in activities you used to enjoy", options: PCL5_OPTIONS },
    { id: "pcl-13", prompt: "Feeling distant or cut off from other people", options: PCL5_OPTIONS },
    { id: "pcl-14", prompt: "Trouble experiencing positive feelings (e.g., unable to feel happiness or love)", options: PCL5_OPTIONS },
    { id: "pcl-15", prompt: "Irritable behavior, angry outbursts, or acting aggressively", options: PCL5_OPTIONS },
    { id: "pcl-16", prompt: "Taking too many risks or doing things that could cause you harm", options: PCL5_OPTIONS },
    { id: "pcl-17", prompt: "Being 'superalert' or watchful or on guard", options: PCL5_OPTIONS },
    { id: "pcl-18", prompt: "Feeling jumpy or easily startled", options: PCL5_OPTIONS },
    { id: "pcl-19", prompt: "Having difficulty concentrating", options: PCL5_OPTIONS },
    { id: "pcl-20", prompt: "Trouble falling or staying asleep", options: PCL5_OPTIONS },
  ],
  scoring: {
    kind: "symptom",
    bands: [
      { upTo: 30, severity: "below_threshold", label: "Below provisional threshold", flag: "monitor", interpretation: "Your total is below the provisional cutoff often used for PTSD screening. Some symptoms may still be present and worth attention." },
      { upTo: 80, severity: "above_threshold", label: "Above provisional threshold", flag: "clinician_recommended", interpretation: "Your total is at or above the provisional cutoff (about 31–33) often used to suggest a fuller PTSD evaluation. Speaking with a trauma-informed clinician is recommended." },
    ],
  },
};

export const AUDITC: Instrument = {
  id: "auditc",
  category: "substance",
  estMinutes: 2,
  name: "AUDIT-C — Alcohol Use Screen",
  shortName: "AUDIT-C",
  description: "A 3-item screen for patterns of alcohol use that may carry risk.",
  prompt: "Please answer the following about your alcohol use. One 'drink' ≈ one beer, one glass of wine, or one shot of spirits.",
  attribution: "Bush et al. (1998) · adapted from WHO AUDIT · free to use",
  license: "free_for_use",
  citation:
    "Bush K, Kivlahan DR, McDonell MB, Fihn SD, Bradley KA. The AUDIT alcohol consumption questions (AUDIT-C). Arch Intern Med. 1998;158(16):1789-95.",
  items: [
    {
      id: "auditc-1",
      prompt: "How often do you have a drink containing alcohol?",
      options: [
        { label: "Never", value: 0 },
        { label: "Monthly or less", value: 1 },
        { label: "2–4 times a month", value: 2 },
        { label: "2–3 times a week", value: 3 },
        { label: "4+ times a week", value: 4 },
      ],
    },
    {
      id: "auditc-2",
      prompt: "How many drinks do you have on a typical day when you are drinking?",
      options: [
        { label: "1–2", value: 0 },
        { label: "3–4", value: 1 },
        { label: "5–6", value: 2 },
        { label: "7–9", value: 3 },
        { label: "10+", value: 4 },
      ],
    },
    {
      id: "auditc-3",
      prompt: "How often do you have six or more drinks on one occasion?",
      options: [
        { label: "Never", value: 0 },
        { label: "Less than monthly", value: 1 },
        { label: "Monthly", value: 2 },
        { label: "Weekly", value: 3 },
        { label: "Daily or almost daily", value: 4 },
      ],
    },
  ],
  scoring: {
    kind: "symptom",
    bands: [
      { upTo: 3, severity: "low_risk", label: "Lower-risk use", flag: "safe", interpretation: "Your responses suggest lower-risk drinking. (Screening thresholds are slightly lower for women: a score of 3+ can warrant a closer look.)" },
      { upTo: 7, severity: "increased_risk", label: "Increased-risk use", flag: "monitor", interpretation: "Your responses suggest a pattern of drinking that can carry increased risk. Reflecting on it, or discussing it with a clinician, may be worthwhile." },
      { upTo: 12, severity: "high_risk", label: "Higher-risk use", flag: "clinician_recommended", interpretation: "Your responses suggest a higher-risk pattern of alcohol use. Talking with a clinician about support options is recommended." },
    ],
  },
};

const CSI_HAPPY: LikertOption[] = [
  { label: "Extremely unhappy", value: 0 },
  { label: "Fairly unhappy", value: 1 },
  { label: "A little unhappy", value: 2 },
  { label: "Happy", value: 3 },
  { label: "Very happy", value: 4 },
  { label: "Extremely happy", value: 5 },
  { label: "Perfect", value: 6 },
];

const CSI_DEGREE: LikertOption[] = [
  { label: "Not at all", value: 0 },
  { label: "A little", value: 1 },
  { label: "Somewhat", value: 2 },
  { label: "Mostly", value: 3 },
  { label: "Almost completely", value: 4 },
  { label: "Completely", value: 5 },
];

export const CSI4: Instrument = {
  id: "csi4",
  category: "relationship",
  estMinutes: 2,
  name: "CSI-4 — Couples Satisfaction Index",
  shortName: "CSI-4",
  description: "A brief, sensitive 4-item measure of relationship satisfaction.",
  prompt: "Please answer the following about your relationship with your partner.",
  attribution: "Funk & Rogge (2007) · freely available for research and clinical use",
  license: "free_for_use",
  citation:
    "Funk JL, Rogge RD. Testing the ruler with item response theory: the Couples Satisfaction Index. J Fam Psychol. 2007;21(4):572-83.",
  items: [
    { id: "csi4-1", prompt: "Please indicate the degree of happiness, all things considered, of your relationship", options: CSI_HAPPY },
    { id: "csi4-2", prompt: "How rewarding is your relationship with your partner?", options: CSI_DEGREE },
    { id: "csi4-3", prompt: "How well does your partner meet your needs?", options: CSI_DEGREE },
    { id: "csi4-4", prompt: "In general, how satisfied are you with your relationship?", options: CSI_DEGREE },
  ],
  scoring: {
    kind: "wellbeing",
    bands: [
      { upTo: 13, severity: "distress", label: "Relationship distress", flag: "monitor", interpretation: "Scores in this range are associated with notable relationship dissatisfaction. This is a starting point for reflection — or, if you'd like, couples-focused support." },
      { upTo: 21, severity: "satisfied", label: "Generally satisfied", flag: "safe", interpretation: "Your responses suggest generally satisfying relationship functioning. Specific areas can still be worth nurturing." },
    ],
  },
};

const RAS_OPTIONS: LikertOption[] = [
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "4", value: 4 },
  { label: "5", value: 5 },
];

export const RAS: Instrument = {
  id: "ras",
  category: "relationship",
  estMinutes: 2,
  name: "RAS — Relationship Assessment Scale",
  shortName: "RAS",
  description: "A 7-item general measure of relationship satisfaction. (1 = low end, 5 = high end of each question.)",
  prompt: "Rate each item from 1 to 5, where 1 is the low end and 5 is the high end of what's described.",
  attribution: "Hendrick (1988) · free to use",
  license: "free_for_use",
  citation:
    "Hendrick SS. A generic measure of relationship satisfaction. J Marriage Fam. 1988;50(1):93-98.",
  items: [
    { id: "ras-1", prompt: "How well does your partner meet your needs? (1 = poorly, 5 = extremely well)", options: RAS_OPTIONS },
    { id: "ras-2", prompt: "In general, how satisfied are you with your relationship? (1 = unsatisfied, 5 = extremely satisfied)", options: RAS_OPTIONS },
    { id: "ras-3", prompt: "How good is your relationship compared to most? (1 = poor, 5 = excellent)", options: RAS_OPTIONS },
    { id: "ras-4", prompt: "How often do you wish you hadn't gotten into this relationship? (1 = never, 5 = very often)", options: RAS_OPTIONS },
    { id: "ras-5", prompt: "To what extent has your relationship met your original expectations? (1 = hardly at all, 5 = completely)", options: RAS_OPTIONS },
    { id: "ras-6", prompt: "How much do you love your partner? (1 = not much, 5 = very much)", options: RAS_OPTIONS },
    { id: "ras-7", prompt: "How many problems are there in your relationship? (1 = very few, 5 = very many)", options: RAS_OPTIONS },
  ],
  scoring: {
    kind: "wellbeing",
    reverseItemIds: ["ras-4", "ras-7"],
    reverseAround: 6,
    bands: [
      { upTo: 18, severity: "low", label: "Lower satisfaction", flag: "monitor", interpretation: "Your responses suggest lower overall relationship satisfaction. This can be a useful prompt for reflection or a conversation with your partner or a clinician." },
      { upTo: 25, severity: "moderate", label: "Moderate satisfaction", flag: "safe", interpretation: "Your responses suggest moderate relationship satisfaction, with room to strengthen specific areas." },
      { upTo: 35, severity: "high", label: "Higher satisfaction", flag: "safe", interpretation: "Your responses suggest higher overall relationship satisfaction." },
    ],
  },
};

const ASEX_OPTIONS: LikertOption[] = [
  { label: "Extremely strong / easily / satisfying", value: 1 },
  { label: "Very", value: 2 },
  { label: "Somewhat", value: 3 },
  { label: "A little / with difficulty", value: 4 },
  { label: "Very little / very difficult", value: 5 },
  { label: "None / never / can't", value: 6 },
];

export const ASEX: Instrument = {
  id: "asex",
  category: "sexual",
  estMinutes: 2,
  name: "ASEX — Arizona Sexual Experience Scale",
  shortName: "ASEX",
  description: "A brief, gender-neutral 5-item measure of sexual drive, arousal, and orgasm over the past week.",
  prompt: "Thinking about the past week, please answer the following. (1 = the easiest / strongest / most satisfying end, 6 = the most difficult end.)",
  attribution: "McGahuey et al. (2000) · free to use",
  license: "free_for_use",
  citation:
    "McGahuey CA, Gelenberg AJ, Laukes CA, et al. The Arizona Sexual Experience Scale (ASEX). J Sex Marital Ther. 2000;26(1):25-40.",
  items: [
    { id: "asex-1", prompt: "How strong is your sex drive?", options: ASEX_OPTIONS },
    { id: "asex-2", prompt: "How easily are you sexually aroused (turned on)?", options: ASEX_OPTIONS },
    { id: "asex-3", prompt: "How easily does your body become physically aroused during sex (lubrication / erection)?", options: ASEX_OPTIONS },
    { id: "asex-4", prompt: "How easily can you reach an orgasm?", options: ASEX_OPTIONS },
    { id: "asex-5", prompt: "Are your orgasms satisfying?", options: ASEX_OPTIONS },
  ],
  scoring: {
    kind: "symptom",
    bands: [
      { upTo: 18, severity: "no_indication", label: "No clear indication of difficulty", flag: "safe", interpretation: "Your total doesn't reach the threshold commonly associated with sexual difficulties. (Note: a single very-high item can still be worth attention.)" },
      { upTo: 30, severity: "possible", label: "Possible sexual difficulties", flag: "monitor", interpretation: "Your responses suggest possible sexual difficulties worth exploring. These often have treatable medical, relational, or psychological contributors — a clinician can help identify which." },
    ],
  },
};

export const INSTRUMENTS: Record<AssessmentId, Instrument> = {
  phq9: PHQ9,
  gad7: GAD7,
  "nsss-s": NSSS_S,
  phq2: PHQ2,
  gad2: GAD2,
  who5: WHO5,
  pss10: PSS10,
  pcl5: PCL5,
  auditc: AUDITC,
  csi4: CSI4,
  ras: RAS,
  asex: ASEX,
};

export const CATEGORY_LABEL: Record<AssessmentCategory, string> = {
  mood: "Mood & depression",
  anxiety: "Anxiety",
  stress: "Stress",
  trauma: "Trauma & post-traumatic stress",
  substance: "Alcohol & substance use",
  wellbeing: "Overall well-being",
  relationship: "Relationships",
  sexual: "Sexual health & satisfaction",
};

export const CATEGORY_ORDER: AssessmentCategory[] = [
  "wellbeing",
  "mood",
  "anxiety",
  "stress",
  "trauma",
  "sexual",
  "relationship",
  "substance",
];

/** Instruments grouped by category, in display order. */
export function instrumentsByCategory(): Array<{ category: AssessmentCategory; items: Instrument[] }> {
  const all = Object.values(INSTRUMENTS);
  return CATEGORY_ORDER.map((category) => ({
    category,
    items: all.filter((i) => i.category === category),
  })).filter((g) => g.items.length > 0);
}

export const LICENSED_LATER: Array<{ id: string; name: string; about: string }> = [
  { id: "fsfi", name: "FSFI — Female Sexual Function Index", about: "Validated 19-item measure of female sexual function. Requires licensing from MAPI Research Trust." },
  { id: "iief5", name: "IIEF-5 / SHIM — International Index of Erectile Function (Short)", about: "5-item screen for erectile dysfunction. Requires licensing from MAPI / Pfizer." },
  { id: "griss", name: "GRISS — Golombok-Rust Inventory of Sexual Satisfaction", about: "Couple/individual sexual function. Requires licensing from Pearson." },
  { id: "fsds-r", name: "FSDS-R — Female Sexual Distress Scale, Revised", about: "Sexual distress measure. Requires licensing from the original authors." },
];

