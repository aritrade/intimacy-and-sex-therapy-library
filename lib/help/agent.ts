/**
 * AI ranking/annotation for Find Help results.
 *
 * The model NEVER invents listings. It only re-orders and annotates the real
 * results we fetched from official APIs: it returns an ordered list of result
 * `ref`s plus a short relevance note, tags, and (for communities) a platform
 * label. We join factual fields (name, url, rating, address) back from the
 * source hit, so hallucination is structurally impossible.
 *
 * Inclusivity is enforced in the prompt: the model must surface affirming,
 * identity-inclusive results and must NEVER exclude or down-rank a result on
 * the basis of orientation, gender identity, relationship structure, or
 * disability. Affirming signals are a positive ranking factor.
 *
 * Falls back to a deterministic heuristic ranker when no LLM is configured.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { chatModel, isLlmConfigured } from "@/lib/ai/llm";
import type { PlaceHit } from "@/lib/providers/places";
import type { WebHit } from "@/lib/providers/websearch";

export type HelpResult = {
  ref: string;
  name: string;
  kind: "clinician" | "community";
  platform: string | null; // reddit | facebook | discord | meetup | local | web
  area: string | null;
  rating: number | null;
  reviews: number | null;
  url: string;
  tags: string[];
  why: string;
  source: "places" | "web";
};

export type RankContext = {
  kind: "clinician" | "community";
  /** Human label of what they searched for (specialty or topic). */
  intent: string;
  location: string;
  affirming: string[]; // e.g. ["LGBTQ+ affirming", "Trans affirming"]
};

const RankSchema = z.object({
  items: z
    .array(
      z.object({
        ref: z.string(),
        why: z.string().max(160),
        tags: z.array(z.string()).max(6),
        platform: z
          .enum(["reddit", "facebook", "discord", "meetup", "local", "web", "other"])
          .nullable()
          .optional(),
      }),
    )
    .max(24),
});

function platformFromHost(host: string): string {
  if (host.includes("reddit")) return "reddit";
  if (host.includes("facebook")) return "facebook";
  if (host.includes("discord")) return "discord";
  if (host.includes("meetup")) return "meetup";
  return "web";
}

/** Map a raw hit to the unified result shape (factual fields only). */
function baseResult(
  hit: PlaceHit | WebHit,
  kind: "clinician" | "community",
): HelpResult {
  if (hit.source === "places") {
    return {
      ref: hit.ref,
      name: hit.name,
      kind,
      platform: "local",
      area: hit.address,
      rating: hit.rating,
      reviews: hit.reviews,
      url: hit.website || hit.url,
      tags: [],
      why: "",
      source: "places",
    };
  }
  return {
    ref: hit.ref,
    name: hit.title,
    kind,
    platform: platformFromHost(hit.host),
    area: null,
    rating: null,
    reviews: null,
    url: hit.url,
    tags: [],
    why: hit.description.slice(0, 140),
    source: "web",
  };
}

function heuristicOrder(results: HelpResult[]): HelpResult[] {
  // Places with ratings first (rating weighted by review volume), then web.
  const score = (r: HelpResult) =>
    r.source === "places"
      ? (r.rating ?? 0) * Math.log10((r.reviews ?? 0) + 10)
      : 0;
  return [...results].sort((a, b) => score(b) - score(a));
}

const SYSTEM = `You curate inclusive, trustworthy directories of sexual-health and intimacy help.

You are given a list of REAL results (each with a stable "ref"). Your job is ONLY to:
  - select and order the most relevant, credible results for the user's intent + location,
  - write a one-line "why" (<= 160 chars, warm, factual, no hype, no medical claims),
  - add up to 6 short tags (e.g. affirming flags, modality, audience),
  - for communities, label the platform.

HARD RULES:
  - Use ONLY the provided refs. Never invent results, names, or URLs.
  - INCLUSIVITY: surface results affirming of every orientation and identity —
    asexual/ace-spectrum, aromantic, demisexual, LGBTQ+, transgender, non-binary,
    intersex, queer, polyamory/ENM, kink-aware, and disability-inclusive. NEVER
    exclude or down-rank a result because of orientation, gender identity,
    relationship structure, or disability. Treat affirming/inclusive signals as
    a POSITIVE ranking factor.
  - Prefer credible, active, well-reviewed results; drop spam and ads.
  - For clinicians, reputable directory profiles (recognised psychology /
    therapy / sexual-health directories and clinic pages) are valid, useful
    results — keep them. Only drop low-quality SEO "top N" listicles.
  - No moralising, no pathologising. Neutral, supportive tone.`;

export async function rankResults(
  hits: Array<PlaceHit | WebHit>,
  ctx: RankContext,
): Promise<HelpResult[]> {
  const byRef = new Map<string, HelpResult>();
  for (const h of hits) {
    const base = baseResult(h, ctx.kind);
    if (!byRef.has(base.ref)) byRef.set(base.ref, base);
  }
  const all = [...byRef.values()];
  if (all.length === 0) return [];

  if (!isLlmConfigured()) return heuristicOrder(all);

  // Compact candidate list for the model (factual fields only).
  const candidates = all.map((r) => ({
    ref: r.ref,
    name: r.name,
    area: r.area,
    rating: r.rating,
    reviews: r.reviews,
    host: r.source === "web" ? new URL(r.url).hostname : null,
    blurb: r.why,
  }));

  const prompt = `INTENT: ${ctx.intent}
LOCATION: ${ctx.location}
AFFIRMING PREFERENCES: ${ctx.affirming.length ? ctx.affirming.join(", ") : "none specified — keep fully inclusive"}
KIND: ${ctx.kind}

CANDIDATES (use only these refs):
${JSON.stringify(candidates, null, 1)}

Return the ordered, curated subset.`;

  try {
    const { object } = await generateObject({
      model: chatModel(),
      system: SYSTEM,
      prompt,
      schema: RankSchema,
      temperature: 0.2,
    });

    const ordered: HelpResult[] = [];
    const seen = new Set<string>();
    for (const item of object.items) {
      const base = byRef.get(item.ref);
      if (!base || seen.has(item.ref)) continue; // ignore any fabricated/dup ref
      seen.add(item.ref);
      ordered.push({
        ...base,
        why: item.why || base.why,
        tags: item.tags ?? [],
        platform: item.platform ?? base.platform,
      });
    }
    // Anything the model dropped is appended (heuristic order) so we never
    // silently lose a real, possibly-relevant result.
    const remainder = heuristicOrder(all.filter((r) => !seen.has(r.ref)));
    return [...ordered, ...remainder];
  } catch {
    return heuristicOrder(all);
  }
}
