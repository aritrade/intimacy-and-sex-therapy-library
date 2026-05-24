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

export type AssessmentId = "phq9" | "gad7" | "nsss-s";

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
};

const PHQ9_OPTIONS: LikertOption[] = [
  { label: "Not at all", value: 0 },
  { label: "Several days", value: 1 },
  { label: "More than half the days", value: 2 },
  { label: "Nearly every day", value: 3 },
];

export const PHQ9: Instrument = {
  id: "phq9",
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

export const INSTRUMENTS: Record<AssessmentId, Instrument> = {
  phq9: PHQ9,
  gad7: GAD7,
  "nsss-s": NSSS_S,
};

export const LICENSED_LATER: Array<{ id: string; name: string; about: string }> = [
  { id: "fsfi", name: "FSFI — Female Sexual Function Index", about: "Validated 19-item measure of female sexual function. Requires licensing from MAPI Research Trust." },
  { id: "iief5", name: "IIEF-5 / SHIM — International Index of Erectile Function (Short)", about: "5-item screen for erectile dysfunction. Requires licensing from MAPI / Pfizer." },
  { id: "griss", name: "GRISS — Golombok-Rust Inventory of Sexual Satisfaction", about: "Couple/individual sexual function. Requires licensing from Pearson." },
  { id: "fsds-r", name: "FSDS-R — Female Sexual Distress Scale, Revised", about: "Sexual distress measure. Requires licensing from the original authors." },
];

