import { INSTRUMENTS } from "./instruments";

/**
 * Display + direction metadata for an instrument, used by the account trend
 * view. Derived from each instrument's scoring config; the three bespoke-scored
 * instruments are hardcoded to their published maxima.
 *
 * `betterWhenHigher` lets the UI label a change as improving vs worsening:
 * symptom scales improve as they fall; well-being / satisfaction scales improve
 * as they rise.
 */
export type ScoreMeta = {
  maxScore: number;
  suffix?: string;
  betterWhenHigher: boolean;
  name: string;
  shortName: string;
};

const BESPOKE: Record<string, { maxScore: number; betterWhenHigher: boolean }> = {
  phq9: { maxScore: 27, betterWhenHigher: false },
  gad7: { maxScore: 21, betterWhenHigher: false },
  "nsss-s": { maxScore: 60, betterWhenHigher: true },
};

export function scoreMeta(instrumentId: string): ScoreMeta | null {
  const inst = INSTRUMENTS[instrumentId as keyof typeof INSTRUMENTS];
  if (!inst) return null;

  const bespoke = BESPOKE[instrumentId];
  if (bespoke) {
    return {
      maxScore: bespoke.maxScore,
      betterWhenHigher: bespoke.betterWhenHigher,
      name: inst.name,
      shortName: inst.shortName,
    };
  }

  const cfg = inst.scoring;
  if (!cfg) {
    return { maxScore: 0, betterWhenHigher: true, name: inst.name, shortName: inst.shortName };
  }

  const reverse = new Set(cfg.reverseItemIds ?? []);
  let maxRaw = 0;
  for (const item of inst.items) {
    const values = item.options.map((o) => o.value);
    const optMax = Math.max(...values);
    const optMin = Math.min(...values);
    maxRaw += reverse.has(item.id) && cfg.reverseAround != null ? cfg.reverseAround - optMin : optMax;
  }

  return {
    maxScore: maxRaw * (cfg.multiplier ?? 1),
    suffix: cfg.scoreSuffix,
    betterWhenHigher: cfg.kind === "wellbeing",
    name: inst.name,
    shortName: inst.shortName,
  };
}
