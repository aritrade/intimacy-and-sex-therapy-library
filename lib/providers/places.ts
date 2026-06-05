/**
 * Google Places provider (classic Places Web Service).
 *
 * Used by the Find Help hub to surface real, publicly-listed clinicians and
 * local communities with ratings + locality autocomplete. Requires
 * GOOGLE_MAPS_API_KEY with the Places API enabled. If the key is absent every
 * function no-ops (returns empty) so the rest of the hub still works.
 *
 * We deliberately use the official API (never SERP scraping) to respect ToS.
 */

const BASE = "https://maps.googleapis.com/maps/api/place";

export type PlaceHit = {
  ref: string; // place_id — stable id used for moderation + maps link
  name: string;
  address: string | null;
  rating: number | null;
  reviews: number | null;
  types: string[];
  url: string; // google maps link
  website?: string | null;
  phone?: string | null;
  source: "places";
};

export function placesConfigured(): boolean {
  return !!process.env.GOOGLE_MAPS_API_KEY;
}

function key(): string {
  return process.env.GOOGLE_MAPS_API_KEY ?? "";
}

function mapsLink(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
}

type TextSearchResponse = {
  status: string;
  results?: Array<{
    place_id: string;
    name: string;
    formatted_address?: string;
    rating?: number;
    user_ratings_total?: number;
    types?: string[];
    business_status?: string;
  }>;
};

/**
 * Free-text Places search, e.g. "sex therapist in Bandra, Mumbai". Returns up
 * to `limit` operational results. Optionally enriches the top `detailsFor`
 * results with website + phone (one extra request each — kept small for cost).
 */
export async function placesTextSearch({
  query,
  limit = 12,
  detailsFor = 8,
  signal,
}: {
  query: string;
  limit?: number;
  detailsFor?: number;
  signal?: AbortSignal;
}): Promise<PlaceHit[]> {
  if (!placesConfigured()) return [];
  const params = new URLSearchParams({ query, key: key() });
  const res = await fetch(`${BASE}/textsearch/json?${params}`, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as TextSearchResponse;
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") return [];

  const rows = (data.results ?? [])
    .filter((r) => r.business_status !== "CLOSED_PERMANENTLY")
    .slice(0, limit);

  const hits: PlaceHit[] = rows.map((r) => ({
    ref: r.place_id,
    name: r.name,
    address: r.formatted_address ?? null,
    rating: typeof r.rating === "number" ? r.rating : null,
    reviews: typeof r.user_ratings_total === "number" ? r.user_ratings_total : null,
    types: r.types ?? [],
    url: mapsLink(r.place_id),
    source: "places",
  }));

  // Enrich the top N with contact details (best-effort, never fatal).
  await Promise.all(
    hits.slice(0, detailsFor).map(async (h) => {
      const d = await placeDetails(h.ref, signal).catch(() => null);
      if (d) {
        h.website = d.website ?? null;
        h.phone = d.phone ?? null;
        if (d.url) h.url = d.url;
      }
    }),
  );

  return hits;
}

type DetailsResponse = {
  status: string;
  result?: { website?: string; formatted_phone_number?: string; url?: string };
};

export async function placeDetails(
  placeId: string,
  signal?: AbortSignal,
): Promise<{ website: string | null; phone: string | null; url: string | null } | null> {
  if (!placesConfigured()) return null;
  const params = new URLSearchParams({
    place_id: placeId,
    fields: "website,formatted_phone_number,url",
    key: key(),
  });
  const res = await fetch(`${BASE}/details/json?${params}`, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as DetailsResponse;
  if (data.status !== "OK" || !data.result) return null;
  return {
    website: data.result.website ?? null,
    phone: data.result.formatted_phone_number ?? null,
    url: data.result.url ?? null,
  };
}

type AutocompleteResponse = {
  status: string;
  predictions?: Array<{ description: string; place_id: string }>;
};

/**
 * Locality autocomplete for the cascading location field, biased to a country
 * and (optionally) prefixed with the chosen state for better matches.
 */
export async function localityAutocomplete({
  input,
  countryComponent,
  limit = 6,
  signal,
}: {
  input: string;
  countryComponent?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<Array<{ description: string; placeId: string }>> {
  if (!placesConfigured() || input.trim().length < 2) return [];
  const params = new URLSearchParams({
    input: input.trim(),
    types: "(cities)",
    key: key(),
  });
  if (countryComponent) params.set("components", `country:${countryComponent}`);
  const res = await fetch(`${BASE}/autocomplete/json?${params}`, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as AutocompleteResponse;
  if (data.status !== "OK") return [];
  return (data.predictions ?? [])
    .slice(0, limit)
    .map((p) => ({ description: p.description, placeId: p.place_id }));
}
