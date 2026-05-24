import { describe, expect, it } from "vitest";
import { parseScript, spokenWordCount } from "@/lib/social/script-parse";

const ROUNDTRIP_FIXTURE = `# Hook
Many people experience ED occasionally — it doesn't define you.

# Body
1. (5s) Stress, sleep, and meds all matter — the body and mind work together.
2. (8s) Mismatched expectations make it worse; talk early, with kindness.
3. (4s) If it persists, a clinician can rule out cardio or hormonal causes.

# CTA
If this resonates, the library has a guided learning path on anxiety-driven ED.

# Caption
ED is more common than people think. This short walks through the most studied factors.

# Hashtags
#sexualhealth #ed #anxiety #couples #therapy

# Citation
Smith et al., JAMA 2021

# Duration
60s
`;

describe("parseScript", () => {
  it("parses every known section from a serialised script", () => {
    const p = parseScript(ROUNDTRIP_FIXTURE);
    expect(p.hook).toMatch(/many people experience ed/i);
    expect(p.body.length).toBe(3);
    expect(p.body[0]).toMatchObject({ index: 1, seconds: 5 });
    expect(p.body[2].text).toMatch(/clinician/i);
    expect(p.cta).toMatch(/learning path/i);
    expect(p.caption).toMatch(/most studied factors/i);
    expect(p.hashtags).toEqual([
      "#sexualhealth",
      "#ed",
      "#anxiety",
      "#couples",
      "#therapy",
    ]);
    expect(p.citation).toBe("Smith et al., JAMA 2021");
    expect(p.durationSeconds).toBe(60);
    expect(p.extraSections).toEqual([]);
  });

  it("returns an empty parsed shape for null/empty input", () => {
    const empty = parseScript("");
    expect(empty.body).toEqual([]);
    expect(empty.hashtags).toEqual([]);
    expect(empty.hook).toBeUndefined();

    const nullish = parseScript(undefined);
    expect(nullish.body).toEqual([]);
    expect(nullish.hashtags).toEqual([]);
  });

  it("preserves unknown sections in extraSections rather than discarding them", () => {
    const md = `# Hook
hi

# WeirdNewSection
this is here on purpose

# Body
1. (3s) only one beat`;
    const p = parseScript(md);
    expect(p.hook).toBe("hi");
    expect(p.extraSections).toEqual([
      { header: "WeirdNewSection", content: "this is here on purpose" },
    ]);
    expect(p.body[0]).toMatchObject({ index: 1, seconds: 3 });
  });

  it("tolerates body entries without an explicit (Ns) prefix", () => {
    const md = `# Body
1. opening line
2. second line
- a stray bullet`;
    const p = parseScript(md);
    expect(p.body.length).toBe(3);
    expect(p.body[0].seconds).toBeUndefined();
    expect(p.body[2].text).toBe("a stray bullet");
  });

  it("ignores garbage hashtags and keeps only #-prefixed tokens", () => {
    const md = `# Hashtags
#good not-a-tag #also_good # alone`;
    const p = parseScript(md);
    expect(p.hashtags).toEqual(["#good", "#also_good"]);
  });

  it("spokenWordCount counts hook + body + cta", () => {
    const p = parseScript(ROUNDTRIP_FIXTURE);
    const n = spokenWordCount(p);
    // Loose lower-bound — exact tokenisation may vary but it must be > 30.
    expect(n).toBeGreaterThan(30);
    expect(n).toBeLessThan(200);
  });
});
