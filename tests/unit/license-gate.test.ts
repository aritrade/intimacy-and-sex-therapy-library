import { describe, expect, it } from "vitest";
import {
  canStoreFullText,
  gateQuote,
  normalizeLicense,
} from "@/lib/ingest/license-gate";

describe("canStoreFullText", () => {
  it("permits open licenses", () => {
    for (const lic of [
      "cc_by",
      "cc_by_sa",
      "cc_by_nc",
      "cc_by_nc_sa",
      "cc_by_nc_nd",
      "cc0",
      "public_domain",
      "govt_work",
      "oa_pmc",
      "original",
    ] as const) {
      expect(canStoreFullText(lic), `expected ${lic} to allow full text`).toBe(true);
    }
  });

  it("forbids full text for copyrighted works", () => {
    expect(canStoreFullText("copyrighted")).toBe(false);
  });
});

describe("gateQuote", () => {
  it("accepts quotes up to the fair-use cap", () => {
    const quote = "word ".repeat(300).trim();
    const r = gateQuote(quote);
    expect(r.ok).toBe(true);
    expect(r.words).toBe(300);
  });

  it("rejects quotes over the fair-use cap", () => {
    const quote = "word ".repeat(301).trim();
    const r = gateQuote(quote);
    expect(r.ok).toBe(false);
    expect(r.words).toBe(301);
  });

  it("counts words correctly with mixed whitespace", () => {
    expect(gateQuote("one two\tthree\nfour").words).toBe(4);
  });
});

describe("normalizeLicense", () => {
  it("recognises common Creative Commons strings", () => {
    expect(normalizeLicense("CC BY 4.0")).toBe("cc_by");
    expect(normalizeLicense("CC BY-SA")).toBe("cc_by_sa");
    expect(normalizeLicense("CC BY-NC")).toBe("cc_by_nc");
    expect(normalizeLicense("CC BY-NC-SA")).toBe("cc_by_nc_sa");
    expect(normalizeLicense("CC BY-NC-ND 4.0")).toBe("cc_by_nc_nd");
    expect(normalizeLicense("CC0")).toBe("cc0");
  });

  it("recognises government-work signals", () => {
    expect(normalizeLicense("U.S. Government Work")).toBe("govt_work");
    expect(normalizeLicense("Crown Copyright (UK)")).toBe("govt_work");
    expect(normalizeLicense("HHS")).toBe("govt_work");
  });

  it("recognises PMC OA + public domain", () => {
    expect(normalizeLicense("OA PMC")).toBe("oa_pmc");
    expect(normalizeLicense("Public Domain")).toBe("public_domain");
  });

  it("flags copyrighted unambiguously", () => {
    expect(normalizeLicense("Copyright 2024 Penguin Random House")).toBe("copyrighted");
  });

  it("returns null for unrecognised licenses (caller must reject)", () => {
    expect(normalizeLicense(undefined)).toBeNull();
    expect(normalizeLicense("")).toBeNull();
    expect(normalizeLicense("???")).toBeNull();
  });
});
