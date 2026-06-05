/**
 * Find Help orchestration: build a query from the user's inputs, fetch real
 * results from official providers (Google Places + web search), rank them with
 * the inclusive agent, and cache by normalized query.
 *
 * Clinicians use Places (geo + ratings). Communities use Places (local groups)
 * and/or web search (online communities), per the requested scope.
 */

import { getOrFetch } from "./cache";
import { rankResults, type HelpResult } from "./agent";
import {
  AFFIRMING_FILTERS,
  countryByCode,
  specialtyById,
  topicById,
  type AffirmingFilter,
} from "./taxonomy";
import { placesConfigured, placesTextSearch, type PlaceHit } from "@/lib/providers/places";
import { webSearch, webSearchConfigured, type WebHit } from "@/lib/providers/websearch";

const CLINICIAN_TTL = 21 * 24 * 60 * 60 * 1000; // 21 days
const COMMUNITY_TTL = 7 * 24 * 60 * 60 * 1000; //  7 days

export type CommunityScope = "local" | "online" | "both";

export function aggregationConfigured(): { places: boolean; web: boolean; any: boolean } {
  const places = placesConfigured();
  const web = webSearchConfigured();
  return { places, web, any: places || web };
}

function locationString(country: string, state?: string, locality?: string): string {
  const label = countryByCode(country)?.label ?? country;
  return [locality, state, label].filter(Boolean).join(", ");
}

function affirmingTerms(ids: AffirmingFilter[]): string[] {
  return ids
    .map((id) => AFFIRMING_FILTERS.find((f) => f.id === id)?.terms[0])
    .filter((t): t is string => !!t);
}

function affirmingLabels(ids: AffirmingFilter[]): string[] {
  return ids
    .map((id) => AFFIRMING_FILTERS.find((f) => f.id === id)?.label)
    .filter((l): l is string => !!l);
}

export type ClinicianSearchInput = {
  country: string;
  state?: string;
  locality?: string;
  specialtyId: string;
  affirming?: AffirmingFilter[];
};

export async function searchClinicians(input: ClinicianSearchInput) {
  const specialty = specialtyById(input.specialtyId);
  const affirming = input.affirming ?? [];
  const location = locationString(input.country, input.state, input.locality);
  const term = specialty?.terms[0] ?? "sex therapist";
  const affTerms = affirmingTerms(affirming);

  return getOrFetch<HelpResult>({
    kind: "clinicians",
    query: {
      country: input.country,
      state: input.state ?? "",
      locality: input.locality ?? "",
      specialty: input.specialtyId,
      affirming: affirming.slice().sort().join(","),
    },
    ttlMs: CLINICIAN_TTL,
    fetcher: async () => {
      if (!placesConfigured()) return { results: [], source: "none" };
      const prefix = affTerms.length ? `${affTerms.join(" ")} ` : "";
      const hits = await placesTextSearch({
        query: `${prefix}${term} in ${location}`,
        limit: 14,
        detailsFor: 10,
      });
      const results = await rankResults(hits, {
        kind: "clinician",
        intent: [specialty?.label ?? term, ...affirmingLabels(affirming)].join(", "),
        location,
        affirming: affirmingLabels(affirming),
      });
      return { results, source: "places" };
    },
  });
}

export type CommunitySearchInput = {
  country: string;
  state?: string;
  locality?: string;
  topicId: string;
  scope: CommunityScope;
  affirming?: AffirmingFilter[];
};

export async function searchCommunities(input: CommunitySearchInput) {
  const topic = topicById(input.topicId);
  const affirming = input.affirming ?? [];
  const location = locationString(input.country, input.state, input.locality);
  const term = topic?.terms[0] ?? "intimacy support community";
  const affTerms = affirmingTerms(affirming);
  const affPrefix = affTerms.length ? `${affTerms.join(" ")} ` : "";

  return getOrFetch<HelpResult>({
    kind: "communities",
    query: {
      country: input.country,
      state: input.state ?? "",
      locality: input.locality ?? "",
      topic: input.topicId,
      scope: input.scope,
      affirming: affirming.slice().sort().join(","),
    },
    ttlMs: COMMUNITY_TTL,
    fetcher: async () => {
      const hits: Array<PlaceHit | WebHit> = [];
      const wantLocal = input.scope === "local" || input.scope === "both";
      const wantOnline = input.scope === "online" || input.scope === "both";

      if (wantLocal && placesConfigured()) {
        const local = await placesTextSearch({
          query: `${affPrefix}${term} support group in ${location}`,
          limit: 10,
          detailsFor: 6,
        });
        hits.push(...local);
      }
      if (wantOnline && webSearchConfigured()) {
        const online = await webSearch({
          query: `${affPrefix}${term} reddit OR facebook group OR discord OR meetup`,
          count: 12,
        });
        hits.push(...online);
      }

      const results = await rankResults(hits, {
        kind: "community",
        intent: [topic?.label ?? term, ...affirmingLabels(affirming)].join(", "),
        location,
        affirming: affirmingLabels(affirming),
      });
      const source =
        wantLocal && wantOnline ? "mixed" : wantLocal ? "places" : "web";
      return { results, source: hits.length ? source : "none" };
    },
  });
}
