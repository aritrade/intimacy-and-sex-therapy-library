import { INSTRUMENTS, type AssessmentId } from "./instruments";

export type Severity =
  | "minimal"
  | "mild"
  | "moderate"
  | "moderately_severe"
  | "severe"
  | "low"
  | "moderate_satisfaction"
  | "high";

export type Flag = "safe" | "monitor" | "clinician_recommended" | "urgent";

export type ScoringResult = {
  rawScore: number;
  maxScore: number;
  severity: Severity;
  severityLabel: string;
  flag: Flag;
  interpretation: string;
  /** True if PHQ-9 item 9 was non-zero. Used to surface crisis resources. */
  crisisSignal: boolean;
};

type Answers = Record<string, number>;

export function score(id: AssessmentId, answers: Answers): ScoringResult {
  switch (id) {
    case "phq9":
      return scorePHQ9(answers);
    case "gad7":
      return scoreGAD7(answers);
    case "nsss-s":
      return scoreNSSS(answers);
  }
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
