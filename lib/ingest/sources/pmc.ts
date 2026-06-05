/**
 * Europe PMC fetcher.
 *
 * Europe PMC mirrors PubMed Central and exposes a clean REST API plus full-
 * text JATS XML for every article in the OA subset. We use:
 *
 *   - GET https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=...
 *     Returns a list of articles with PMID/PMCID and license information.
 *
 *   - GET https://www.ebi.ac.uk/europepmc/webservices/rest/{source}/{id}/fullTextXML
 *     Returns the JATS XML body. We extract title, abstract, body sections.
 *
 * License field examples seen in the wild: "cc by", "cc by-nc", "cc by-nc-nd",
 * "cc0", "Public Domain". We map all of these via license-gate.normalizeLicense
 * and refuse anything we can't classify.
 */

import { normalizeLicense, type License } from "../license-gate";

const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest";

export type PmcHit = {
  source: string; // typically "MED" or "PMC"
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title: string;
  authors: string[];
  publishedYear?: number;
  abstract?: string;
  license: License;
  isOpenAccess: boolean;
  externalUrl: string;
};

type SearchResponse = {
  resultList: {
    result: Array<{
      id?: string;
      source?: string;
      pmid?: string;
      pmcid?: string;
      doi?: string;
      title?: string;
      authorString?: string;
      pubYear?: string;
      abstractText?: string;
      isOpenAccess?: "Y" | "N";
      license?: string;
    }>;
  };
};

export async function searchEuropePmc({
  query,
  limit = 25,
  signal,
}: {
  query: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<PmcHit[]> {
  const params = new URLSearchParams({
    query: `${query} AND OPEN_ACCESS:Y`,
    resultType: "core",
    format: "json",
    pageSize: String(Math.min(limit, 100)),
  });
  const res = await fetch(`${BASE}/search?${params}`, { signal });
  if (!res.ok) {
    throw new Error(`Europe PMC search failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as SearchResponse;
  const hits: PmcHit[] = [];

  for (const r of data.resultList?.result ?? []) {
    if (r.isOpenAccess !== "Y") continue;
    if (!r.title) continue;

    const license = normalizeLicense(r.license ?? "oa pmc");
    if (!license) continue; // refuse unknown licenses

    const externalUrl = r.pmcid
      ? `https://europepmc.org/article/PMC/${r.pmcid.replace(/^PMC/, "")}`
      : r.doi
      ? `https://doi.org/${r.doi}`
      : `https://europepmc.org/abstract/MED/${r.pmid ?? ""}`;

    hits.push({
      source: r.source ?? "MED",
      pmid: r.pmid,
      pmcid: r.pmcid,
      doi: r.doi,
      title: r.title,
      authors: (r.authorString ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      publishedYear: r.pubYear ? Number(r.pubYear) : undefined,
      abstract: r.abstractText,
      license,
      isOpenAccess: true,
      externalUrl,
    });
  }
  return hits;
}

/**
 * Fetch the full-text JATS XML for a PMC article and extract a plain-text
 * body. We strip XML tags and collapse whitespace; downstream chunker handles
 * the rest. Returns null if the article doesn't have full text available.
 */
export async function fetchFullText(
  hit: PmcHit,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!hit.pmcid) return null;
  // Europe PMC OA full text lives at /{PMCID}/fullTextXML where the id KEEPS
  // its "PMC" prefix (e.g. /PMC10407917/fullTextXML). The older /PMC/{num}/...
  // shape 404s for every article.
  const pmcid = hit.pmcid.startsWith("PMC") ? hit.pmcid : `PMC${hit.pmcid}`;
  const url = `${BASE}/${pmcid}/fullTextXML`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const xml = await res.text();
  return jatsXmlToText(xml);
}

/**
 * Minimal JATS XML -> plaintext. Intentionally simple: strip everything that
 * isn't body content (refs, tables, figures), unwrap inline tags, collapse
 * whitespace. Good enough for embedding; not for archival display.
 */
export function jatsXmlToText(xml: string): string {
  let s = xml;

  // Drop sections we don't want in the embedded text
  s = s.replace(/<ref-list[\s\S]*?<\/ref-list>/g, "");
  s = s.replace(/<table-wrap[\s\S]*?<\/table-wrap>/g, "");
  s = s.replace(/<fig[\s\S]*?<\/fig>/g, "");
  s = s.replace(/<back[\s\S]*?<\/back>/g, "");
  s = s.replace(/<front[\s\S]*?<\/front>/g, "");

  // Preserve paragraph and section breaks as newlines
  s = s.replace(/<\/(p|sec|title|abstract)>/g, "\n\n");

  // Strip remaining tags
  s = s.replace(/<[^>]+>/g, " ");

  // HTML entities
  s = s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"');

  return s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
