import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/en";
import { hi } from "@/lib/i18n/hi";
import { hinglish } from "@/lib/i18n/hinglish";
import { LOCALES, LOCALE_LABELS, t } from "@/lib/i18n";

/**
 * Locale parity:
 *
 *   - Every key path in `en` MUST exist in `hi` and `hinglish`.
 *   - Every key path in `hi` and `hinglish` MUST exist in `en`.
 *   - Every leaf MUST be a non-empty string.
 *
 * If a future translator misses a key, this test names the missing path so
 * the diff in CI is human-readable instead of a generic snapshot mismatch.
 */

type Tree = Record<string, unknown>;

function paths(obj: Tree, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const here = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...paths(v as Tree, here));
    } else {
      out.push(here);
    }
  }
  return out;
}

function getAt(obj: Tree, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, k) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined,
      obj,
    );
}

describe("i18n locale parity", () => {
  const enKeys = paths(en as unknown as Tree);

  it("hi has the same key set as en", () => {
    const hiKeys = new Set(paths(hi as unknown as Tree));
    const missing = enKeys.filter((k) => !hiKeys.has(k));
    const extra = [...hiKeys].filter((k) => !enKeys.includes(k));
    expect(missing, `hi is missing keys: ${missing.join(", ")}`).toEqual([]);
    expect(extra, `hi has extra keys not in en: ${extra.join(", ")}`).toEqual([]);
  });

  it("hinglish has the same key set as en", () => {
    const hinglishKeys = new Set(paths(hinglish as unknown as Tree));
    const missing = enKeys.filter((k) => !hinglishKeys.has(k));
    const extra = [...hinglishKeys].filter((k) => !enKeys.includes(k));
    expect(missing, `hinglish is missing keys: ${missing.join(", ")}`).toEqual([]);
    expect(extra, `hinglish has extra keys not in en: ${extra.join(", ")}`).toEqual([]);
  });

  it("every leaf is a non-empty string in every locale", () => {
    for (const [name, tree] of [
      ["en", en],
      ["hi", hi],
      ["hinglish", hinglish],
    ] as const) {
      for (const p of paths(tree as unknown as Tree)) {
        const v = getAt(tree as unknown as Tree, p);
        expect(typeof v, `${name}.${p} is not a string`).toBe("string");
        expect((v as string).trim().length, `${name}.${p} is empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe("i18n helpers", () => {
  it("LOCALES contains exactly en, hi, hinglish", () => {
    expect(Object.keys(LOCALES).sort()).toEqual(["en", "hi", "hinglish"]);
  });

  it("LOCALE_LABELS uses the script of each locale", () => {
    expect(LOCALE_LABELS.en).toBe("English");
    expect(LOCALE_LABELS.hi).toMatch(/[\u0900-\u097F]/); // Devanagari range
    expect(LOCALE_LABELS.hinglish).toMatch(/Hinglish/i);
  });

  it("t() returns the right locale and falls back to en", () => {
    expect(t("hi").brand.name).toBe(hi.brand.name);
    expect(t("hinglish").brand.name).toBe(hinglish.brand.name);
    // @ts-expect-error: intentionally invalid locale to verify fallback
    expect(t("xx").brand.name).toBe(en.brand.name);
  });
});
