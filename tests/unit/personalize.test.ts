import { describe, expect, it } from "vitest";
import {
  CONCERN_OPTIONS,
  DEPTH_OPTIONS,
  RELATIONSHIP_OPTIONS,
  recommendFor,
  type IntakeAnswers,
} from "../../lib/personalize";

function answers(partial: Partial<IntakeAnswers>): IntakeAnswers {
  return {
    concern: "curiosity",
    relationship: "single",
    depth: "gentle",
    completedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("recommendFor", () => {
  it("always returns at least three recommendations", () => {
    for (const c of CONCERN_OPTIONS) {
      const recs = recommendFor(answers({ concern: c.id }));
      expect(recs.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("returns exactly four entries (three primary + one nudge)", () => {
    const recs = recommendFor(
      answers({ concern: "desire_mismatch", relationship: "married" }),
    );
    expect(recs.length).toBe(4);
  });

  it("appends a couples nudge when partnered or married", () => {
    const married = recommendFor(
      answers({ concern: "performance", relationship: "married" }),
    );
    expect(married.some((r) => r.href.includes("couple_counselling"))).toBe(true);
  });

  it("appends a solo nudge when single or dating", () => {
    const single = recommendFor(
      answers({ concern: "curiosity", relationship: "single" }),
    );
    expect(single.some((r) => r.href.includes("intimacy_basics"))).toBe(true);
  });

  it("never returns duplicates", () => {
    const recs = recommendFor(
      answers({ concern: "sexless", relationship: "married" }),
    );
    const seen = new Set(recs.map((r) => r.href));
    expect(seen.size).toBe(recs.length);
  });

  it("routes pain_or_vaginismus toward trauma-informed content", () => {
    const recs = recommendFor(
      answers({ concern: "pain_or_vaginismus", relationship: "partnered" }),
    );
    expect(recs.some((r) => r.href.includes("vaginismus"))).toBe(true);
  });

  it("routes lgbtq_affirming toward the affirming path", () => {
    const recs = recommendFor(
      answers({ concern: "lgbtq_affirming", relationship: "single" }),
    );
    expect(recs.some((r) => r.href === "/paths/lgbtq-affirming")).toBe(true);
  });

  it("falls back gracefully for prefer_not_say without throwing", () => {
    const recs = recommendFor(
      answers({ concern: "prefer_not_say", relationship: "prefer_not_say" }),
    );
    expect(recs.length).toBeGreaterThan(0);
  });
});

describe("question option shape", () => {
  it("every concern option has a unique id and a non-empty label", () => {
    const ids = new Set<string>();
    for (const o of CONCERN_OPTIONS) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(ids.has(o.id)).toBe(false);
      ids.add(o.id);
    }
  });

  it("every relationship and depth option has a unique id", () => {
    for (const list of [RELATIONSHIP_OPTIONS, DEPTH_OPTIONS]) {
      const ids = new Set<string>();
      for (const o of list) {
        expect(o.label.length).toBeGreaterThan(0);
        expect(ids.has(o.id)).toBe(false);
        ids.add(o.id);
      }
    }
  });
});
