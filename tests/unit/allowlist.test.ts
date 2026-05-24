import { describe, expect, it } from "vitest";
import {
  ALLOWLIST,
  HARD_BLOCKLIST,
  isAllowlisted,
  isHardBlocked,
} from "@/lib/ingest/allowlist";

describe("ingest allowlist", () => {
  it("contains at least the canonical clinical bodies", () => {
    const slugs = ALLOWLIST.map((s) => s.slug);
    // A non-exhaustive sanity floor: PMC OA + WPATH + WHO are non-negotiable.
    expect(slugs).toContain("pmc-oa");
    expect(slugs).toContain("wpath");
    expect(slugs).toContain("who");
  });

  it("every entry has a parseable URL, explicit kind, and trust tier", () => {
    for (const src of ALLOWLIST) {
      expect(src.slug).toMatch(/^[a-z0-9-]+$/);
      expect(() => new URL(src.url)).not.toThrow();
      expect(typeof src.name).toBe("string");
      expect(src.name.length).toBeGreaterThan(0);
      expect(typeof src.kind).toBe("string");
      expect(typeof src.trustTier).toBe("string");
    }
  });

  it("isAllowlisted accepts the exact host and deeper subdomains", () => {
    expect(isAllowlisted("www.who.int")).toBe(true);
    expect(isAllowlisted("apps.www.who.int")).toBe(true);
    expect(isAllowlisted("www.cdc.gov")).toBe(true);
  });

  it("isAllowlisted rejects unrelated hosts", () => {
    expect(isAllowlisted("medium.com")).toBe(false);
    expect(isAllowlisted("random-blog.example")).toBe(false);
  });

  it("HARD_BLOCKLIST flags the obvious offenders", () => {
    for (const host of [
      "tiktok.com",
      "www.onlyfans.com",
      "pornhub.com",
      "old.reddit.com",
      "any.medium.com",
      "anyone.substack.com",
    ]) {
      expect(isHardBlocked(host), `expected ${host} to be hard-blocked`).toBe(true);
    }
  });

  it("HARD_BLOCKLIST does not catch legitimate hosts", () => {
    for (const host of ["who.int", "ncbi.nlm.nih.gov", "wpath.org"]) {
      expect(isHardBlocked(host)).toBe(false);
    }
  });

  it("blocklist and allowlist do not collide", () => {
    for (const src of ALLOWLIST) {
      const host = new URL(src.url).hostname;
      expect(
        HARD_BLOCKLIST.some((re) => re.test(host)),
        `allowlisted source ${src.slug} (${host}) is also hard-blocked`,
      ).toBe(false);
    }
  });
});
