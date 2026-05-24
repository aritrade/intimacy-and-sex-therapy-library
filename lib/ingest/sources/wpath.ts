/**
 * WPATH SOC8 fetcher.
 *
 * The Standards of Care, Version 8 is published under CC BY-NC-ND 4.0 and is
 * the canonical clinical guideline for trans-affirming care. We can host the
 * PDF with attribution.
 *
 * The English original is published in International Journal of Transgender
 * Health (Coleman et al., 2022) and is mirrored on wpath.org. Translations
 * (Italian, Norwegian, Thai, etc.) are linked from
 * https://wpath.org/publications/soc8/
 *
 * This module returns a list of resource records (without full-text body) so
 * the operator can run the rest of the pipeline. Body extraction from the
 * PDF happens in pipeline.ts via pdf-parse on the downloaded file.
 */

import type { License } from "../license-gate";

export type WpathDoc = {
  title: string;
  authors: string[];
  publishedYear: number;
  language: string;
  pdfUrl: string;
  externalUrl: string;
  license: License;
  doi?: string;
  citation: string;
};

/**
 * SOC8 entries we know are CC BY-NC-ND. Operators add translations here as
 * they're verified to carry the same license.
 */
export const WPATH_SOC8: WpathDoc[] = [
  {
    title:
      "Standards of Care for the Health of Transgender and Gender Diverse People, Version 8",
    authors: [
      "Coleman, E.",
      "Radix, A.E.",
      "Bouman, W.P.",
      "et al.",
    ],
    publishedYear: 2022,
    language: "en",
    pdfUrl:
      "https://www.tandfonline.com/doi/pdf/10.1080/26895269.2022.2100644",
    externalUrl: "https://wpath.org/publications/soc8/",
    license: "cc_by_nc_nd",
    doi: "10.1080/26895269.2022.2100644",
    citation:
      "Coleman, E., et al. (2022). Standards of Care for the Health of Transgender and Gender Diverse People, Version 8. International Journal of Transgender Health, 23(sup1), S1–S259.",
  },
];

export function listWpathDocs(): WpathDoc[] {
  return WPATH_SOC8;
}
