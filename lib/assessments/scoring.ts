import { INSTRUMENTS, type AssessmentId, type Instrument } from "./instruments";

export type Severity = string;

export type Flag = "safe" | "monitor" | "clinician_recommended" | "urgent";

/**
 * A single interpretation band, keyed by an inclusive upper bound on the
 * (reverse-corrected, optionally transformed) raw score. Bands are evaluated
 * in array order; the first whose `upTo` is >= the score wins.
 */
export type Band = {
  upTo: number;
  severity: string;
  label: string;
  flag: Flag;
  interpretation: string;
};

/**
 * Declarative scoring config carried on an Instrument. Lets us add new
 * validated instruments without hand-writing a scorer for each — we only
 * encode the instrument's own published cutoffs.
 */
export type ScoringConfig = {
  /** "symptom": higher = more symptoms. "wellbeing": higher = better. */
  kind: "symptom" | "wellbeing";
  /** Item ids that are reverse-scored. */
  reverseItemIds?: string[];
  /** Reverse formula: newValue = reverseAround - value (e.g. 0-4 scale → 4). */
  reverseAround?: number;
  /** Items that, if endorsed, surface crisis resources. */
  crisisItemIds?: string[];
  /** Optional raw-score multiplier (e.g. WHO-5 reports raw × 4 as a %). */
  multiplier?: number;
  /** Suffix appended after the score in the UI (e.g. "%"). */
  scoreSuffix?: string;
  bands: Band[];
};

export type ScoringResult = {
  rawScore: number;
  maxScore: number;
  severity: Severity;
  severityLabel: string;
  flag: Flag;
  interpretation: string;
  /** True if a crisis-signal item was endorsed. Surfaces crisis resources. */
  crisisSignal: boolean;
  /** Optional display suffix for the score (e.g. "%"). */
  scoreSuffix?: string;
};

type Answers = Record<string, number>;

export function score(id: AssessmentId, answers: Answers): ScoringResult {
  // Bespoke scorers retained for the original three instruments.
  switch (id) {
    case "phq9":
      return scorePHQ9(answers);
    case "gad7":
      return scoreGAD7(answers);
    case "nsss-s":
      return scoreNSSS(answers);
    default:
      break;
  }
  const inst = INSTRUMENTS[id];
  if (inst?.scoring) return scoreByBands(inst, answers);
  throw new Error(`No scoring configured for assessment "${id}".`);
}

/** Generic scorer driven by an instrument's declarative `scoring` config. */
function scoreByBands(inst: Instrument, answers: Answers): ScoringResult {
  const cfg = inst.scoring!;
  const reverse = new Set(cfg.reverseItemIds ?? []);

  let raw = 0;
  let maxRaw = 0;
  for (const item of inst.items) {
    const values = item.options.map((o) => o.value);
    const optMax = Math.max(...values);
    const optMin = Math.min(...values);
    const v = answers[item.id] ?? optMin;
    if (reverse.has(item.id) && cfg.reverseAround != null) {
      raw += cfg.reverseAround - v;
      maxRaw += cfg.reverseAround - optMin;
    } else {
      raw += v;
      maxRaw += optMax;
    }
  }

  const mult = cfg.multiplier ?? 1;
  const display = raw * mult;
  const maxDisplay = maxRaw * mult;

  const band =
    cfg.bands.find((b) => display <= b.upTo) ?? cfg.bands[cfg.bands.length - 1];

  const crisisSignal = (cfg.crisisItemIds ?? []).some((id) => (answers[id] ?? 0) > 0);
  const flag: Flag = crisisSignal && rank(band.flag) < rank("urgent") ? "urgent" : band.flag;

  return {
    rawScore: display,
    maxScore: maxDisplay,
    severity: band.severity,
    severityLabel: band.label,
    flag,
    interpretation: band.interpretation,
    crisisSignal,
    scoreSuffix: cfg.scoreSuffix,
  };
}

function rank(f: Flag): number {
  return { safe: 0, monitor: 1, clinician_recommended: 2, urgent: 3 }[f];
}

function sumAll(items: Array<{ id: string }>, answers: Answers): number {
  return items.reduce((acc, it) => acc + (answers[it.id] ?? 0), 0);
}

function scorePHQ9(answers: Answers): ScoringResult {
  const items = INSTRUMENTS.phq9.items;
  const raw = sumAll(items, answers);
  const item9 = answers["phq9-9"] ?? 0;
  let severity: Severity;
  let severityLabel: string;
  let interpretation: string;
  if (raw <= 4) {
    severity = "minimal";
    severityLabel = "Minimal depression";
    interpretation = "Your responses suggest minimal depressive symptoms. Continue self-care and check in periodically.";
  } else if (raw <= 9) {
    severity = "mild";
    severityLabel = "Mild depression";
    interpretation = "Your responses suggest mild depressive symptoms. Watchful waiting is reasonable; reach out to a clinician if symptoms persist.";
  } else if (raw <= 14) {
    severity = "moderate";
    severityLabel = "Moderate depression";
    interpretation = "Your responses suggest moderate depressive symptoms. Consider speaking with a clinician.";
  } else if (raw <= 19) {
    severity = "moderately_severe";
    severityLabel = "Moderately severe depression";
    interpretation = "Your responses suggest moderately severe depressive symptoms. Speaking with a clinician is recommended.";
  } else {
    severity = "severe";
    severityLabel = "Severe depression";
    interpretation = "Your responses suggest severe depressive symptoms. We strongly recommend reaching out to a mental health clinician soon.";
  }
  const crisisSignal = item9 > 0;
  let flag: Flag = "safe";
  if (raw >= 15 || crisisSignal) flag = "urgent";
  else if (raw >= 10) flag = "clinician_recommended";
  else if (raw >= 5) flag = "monitor";

  return {
    rawScore: raw,
    maxScore: 27,
    severity,
    severityLabel,
    flag,
    interpretation,
    crisisSignal,
  };
}

function scoreGAD7(answers: Answers): ScoringResult {
  const items = INSTRUMENTS.gad7.items;
  const raw = sumAll(items, answers);
  let severity: Severity;
  let severityLabel: string;
  let interpretation: string;
  let flag: Flag = "safe";
  if (raw <= 4) {
    severity = "minimal";
    severityLabel = "Minimal anxiety";
    interpretation = "Minimal anxiety symptoms.";
    flag = "safe";
  } else if (raw <= 9) {
    severity = "mild";
    severityLabel = "Mild anxiety";
    interpretation = "Mild anxiety symptoms. Consider stress-management strategies.";
    flag = "monitor";
  } else if (raw <= 14) {
    severity = "moderate";
    severityLabel = "Moderate anxiety";
    interpretation = "Moderate anxiety symptoms. Speaking with a clinician is reasonable.";
    flag = "clinician_recommended";
  } else {
    severity = "severe";
    severityLabel = "Severe anxiety";
    interpretation = "Severe anxiety symptoms. We recommend speaking with a clinician soon.";
    flag = "urgent";
  }
  return {
    rawScore: raw,
    maxScore: 21,
    severity,
    severityLabel,
    flag,
    interpretation,
    crisisSignal: false,
  };
}

function scoreNSSS(answers: Answers): ScoringResult {
  const items = INSTRUMENTS["nsss-s"].items;
  const raw = sumAll(items, answers); // 12..60
  // The published instrument is descriptive — there are no clinical cutoffs.
  // We surface tertiles for orientation only, with a clear caveat in the UI.
  let severity: Severity;
  let severityLabel: string;
  let interpretation: string;
  if (raw < 28) {
    severity = "low";
    severityLabel = "Lower satisfaction";
    interpretation =
      "Your responses suggest a lower level of overall sexual satisfaction. This isn't a diagnosis — it's a starting point for reflection or conversation with a clinician or partner.";
  } else if (raw < 44) {
    severity = "moderate_satisfaction";
    severityLabel = "Moderate satisfaction";
    interpretation =
      "Your responses suggest moderate overall sexual satisfaction. There may be specific areas you'd like to focus on.";
  } else {
    severity = "high";
    severityLabel = "Higher satisfaction";
    interpretation =
      "Your responses suggest higher overall sexual satisfaction across the dimensions measured.";
  }
  return {
    rawScore: raw,
    maxScore: 60,
    severity,
    severityLabel,
    flag: "safe",
    interpretation,
    crisisSignal: false,
  };
}
