/**
 * License gate. Per the project's non-negotiables:
 *
 *   - For OPEN-LICENSED works (CC, public domain, government work, PMC OA),
 *     we MAY ingest full text into the RAG store.
 *   - For COPYRIGHTED works, we ONLY persist metadata + curator notes +
 *     fair-use snippets (≤ 300 words) + deep links to authorized sources.
 *
 * This module is the single source of truth for that distinction.
 */

export const LICENSES = [
  "cc_by",
  "cc_by_sa",
  "cc_by_nc",
  "cc_by_nc_sa",
  "cc_by_nc_nd",
  "cc0",
  "public_domain",
  "govt_work",
  "oa_pmc",
  "copyrighted",
  "original",
] as const;

export type License = (typeof LICENSES)[number];

const FULL_TEXT_OK: ReadonlySet<License> = new Set([
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
]);

export function canStoreFullText(license: License): boolean {
  return FULL_TEXT_OK.has(license);
}

const FAIR_USE_QUOTE_MAX_WORDS = 300;

export function gateQuote(quote: string): { ok: boolean; words: number } {
  const words = quote.trim().split(/\s+/).filter(Boolean).length;
  return { ok: words <= FAIR_USE_QUOTE_MAX_WORDS, words };
}

/**
 * Map a license string from a source feed into our canonical License enum.
 * Returns `null` if the input is unrecognized — the pipeline must REJECT
 * unknown licenses rather than guess.
 */
export function normalizeLicense(input: string | null | undefined): License | null {
  if (!input) return null;
  const s = input.toLowerCase().trim();

  if (s.includes("public domain") || s === "pd") return "public_domain";
  if (s.includes("cc0")) return "cc0";

  if (s.includes("cc by") || s.includes("cc-by") || s.includes("creativecommons.org/licenses/by/")) {
    if (s.includes("nc") && s.includes("nd")) return "cc_by_nc_nd";
    if (s.includes("nc") && s.includes("sa")) return "cc_by_nc_sa";
    if (s.includes("nc")) return "cc_by_nc";
    if (s.includes("sa")) return "cc_by_sa";
    return "cc_by";
  }

  if (
    s.includes("government") ||
    s.includes("u.s. government") ||
    s.includes("crown copyright") ||
    s.includes("nih") ||
    s.includes("hhs")
  ) {
    return "govt_work";
  }
  if (s.includes("oa") && s.includes("pmc")) return "oa_pmc";
  if (s.includes("copyright")) return "copyrighted";

  return null;
}
