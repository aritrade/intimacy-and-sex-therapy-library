import { INSTRUMENTS, type AssessmentId, type Instrument } from "./instruments";

/**
 * Lightweight triage: map the concerns a person selects onto an ordered,
 * de-duplicated set of validated instruments. Short first-pass screens are
 * listed ahead of their longer counterparts so people aren't over-tested.
 *
 * This is routing, not diagnosis — it only decides which questionnaires to
 * suggest.
 */

export type Concern = {
  id: string;
  label: string;
  hint?: string;
  /** Instruments to recommend, in the order they should be offered. */
  instruments: AssessmentId[];
};

export const CONCERNS: Concern[] = [
  {
    id: "mood",
    label: "Low mood or feeling down",
    hint: "Sadness, loss of interest, hopelessness",
    instruments: ["phq2", "phq9"],
  },
  {
    id: "anxiety",
    label: "Worry or anxiety",
    hint: "Nervousness, racing thoughts, can't switch off",
    instruments: ["gad2", "gad7"],
  },
  {
    id: "stress",
    label: "Stress or feeling overwhelmed",
    hint: "Too much on your plate, hard to cope",
    instruments: ["pss10", "who5"],
  },
  {
    id: "wellbeing",
    label: "Energy, sleep, and overall well-being",
    hint: "A general check-in on how you're doing",
    instruments: ["who5"],
  },
  {
    id: "trauma",
    label: "Aftermath of a difficult or traumatic experience",
    hint: "Flashbacks, avoidance, feeling on edge",
    instruments: ["pcl5"],
  },
  {
    id: "relationship",
    label: "My relationship with a partner",
    hint: "Connection, satisfaction, recurring conflict",
    instruments: ["csi4", "ras"],
  },
  {
    id: "sexual",
    label: "Sexual desire, function, or satisfaction",
    hint: "Drive, arousal, orgasm, or overall satisfaction",
    instruments: ["asex", "nsss-s"],
  },
  {
    id: "substance",
    label: "My drinking or substance use",
    hint: "Whether a pattern might be carrying risk",
    instruments: ["auditc"],
  },
];

export function concernById(id: string): Concern | undefined {
  return CONCERNS.find((c) => c.id === id);
}

/** Ordered, de-duplicated instruments for the chosen concerns. */
export function recommend(selectedConcernIds: string[]): Instrument[] {
  const seen = new Set<AssessmentId>();
  const out: Instrument[] = [];
  for (const cid of selectedConcernIds) {
    const concern = concernById(cid);
    if (!concern) continue;
    for (const aid of concern.instruments) {
      if (seen.has(aid)) continue;
      seen.add(aid);
      out.push(INSTRUMENTS[aid]);
    }
  }
  return out;
}
