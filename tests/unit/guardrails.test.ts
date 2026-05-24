import { describe, expect, it } from "vitest";
import { detectCrisis, REFUSAL_CATEGORIES } from "@/lib/safety/guardrails";

describe("detectCrisis", () => {
  it("flags self-harm phrasing in English", () => {
    expect(detectCrisis("I want to kill myself").map((h) => h.category)).toContain(
      "self_harm",
    );
    expect(detectCrisis("I'm suicidal lately").map((h) => h.category)).toContain(
      "self_harm",
    );
    expect(detectCrisis("I don't want to live anymore").map((h) => h.category)).toContain(
      "self_harm",
    );
  });

  it("flags Hinglish phrases for self-harm", () => {
    expect(
      detectCrisis("main marna chahta hoon").map((h) => h.category),
    ).toContain("self_harm");
    expect(
      detectCrisis("jeena nahi chahta ab").map((h) => h.category),
    ).toContain("self_harm");
  });

  it("flags imminent violence", () => {
    expect(
      detectCrisis("I am going to hurt him").map((h) => h.category),
    ).toContain("imminent_violence");
  });

  it("flags sexual violence disclosures", () => {
    expect(detectCrisis("I was raped").map((h) => h.category)).toContain(
      "sexual_violence",
    );
    expect(
      detectCrisis("she was sexually assaulted").map((h) => h.category),
    ).toContain("sexual_violence");
  });

  it("flags minor-at-risk disclosures", () => {
    expect(detectCrisis("I am 16").map((h) => h.category)).toContain("minor_at_risk");
    expect(detectCrisis("I'm a minor").map((h) => h.category)).toContain("minor_at_risk");
  });

  it("flags domestic violence (English + Hinglish)", () => {
    expect(
      detectCrisis("my husband hits me sometimes").map((h) => h.category),
    ).toContain("domestic_violence");
    expect(detectCrisis("woh maarta hai").map((h) => h.category)).toContain(
      "domestic_violence",
    );
  });

  it("returns no hits on benign messages", () => {
    expect(detectCrisis("we had a great date last weekend")).toEqual([]);
    expect(detectCrisis("ask me about communication patterns")).toEqual([]);
  });

  it("dedupes within a category (one hit max per category)", () => {
    const hits = detectCrisis("I want to kill myself, I am suicidal");
    const selfHarm = hits.filter((h) => h.category === "self_harm");
    expect(selfHarm.length).toBe(1);
  });
});

describe("REFUSAL_CATEGORIES", () => {
  it("covers the platform's non-negotiable refusals", () => {
    expect(REFUSAL_CATEGORIES).toContain("explicit_or_erotic_content");
    expect(REFUSAL_CATEGORIES).toContain("advice_for_minors");
    expect(REFUSAL_CATEGORIES).toContain("medication_dosing");
    expect(REFUSAL_CATEGORIES).toContain("diagnostic_statements");
    expect(REFUSAL_CATEGORIES).toContain("anti_lgbtq_or_anti_ace_framing");
    expect(REFUSAL_CATEGORIES).toContain("encouragement_of_self_harm");
  });
});
