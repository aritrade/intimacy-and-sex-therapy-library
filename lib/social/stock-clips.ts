/**
 * Stock-footage selector for the StockReel and LongFormEssay templates.
 *
 * Two free providers in priority order:
 *   1. Pexels Videos API — 200 req/hr free, attribution NOT required.
 *      Higher production value, mostly cinematic.
 *   2. Pixabay Videos API — 5K req/hr free, attribution NOT required.
 *      Bigger library, more variety, occasionally lower quality.
 *
 * Calling pattern:
 *   await pickClipsForScript(script)
 *      -> per-scene array of { url, posterUrl, attribution, durationSec }
 *
 * The scene-to-keyword mapping is intentionally simple: we extract
 * 2–4 nouns and a topic word from each scene's text via a tiny
 * keyword extractor that strips stopwords. We avoid LLM calls here
 * because (a) we want zero cost, (b) the keyword set for our domain
 * is small enough that simple extraction works, and (c) determinism
 * makes failures easier to debug.
 *
 * The selector also enforces a topic safelist — e.g. "intimacy" maps
 * to "couple holding hands" not "kissing", because half the stock
 * "intimacy" results on these libraries get auto-flagged by IG.
 *
 * Returns an empty array when no provider key is configured. Callers
 * should fall back to the typography template.
 */

import type { GeneratedScript } from "./script-generator";

export type StockClip = {
  url: string;
  posterUrl: string | null;
  attribution: string | null;
  durationSec: number;
  width: number;
  height: number;
  source: "pexels" | "pixabay";
};

const SAFE_QUERY_REWRITES: Record<string, string> = {
  intimacy: "couple holding hands",
  sex: "embrace silhouette",
  desire: "candle flame slow motion",
  arousal: "heart rate monitor",
  trauma: "soft sunlight window",
  shame: "rain on window",
  anxiety: "breathing exercise",
  partner: "couple walking",
  body: "yoga stretch silhouette",
  pleasure: "warm tea steam",
  consent: "two people talking cafe",
  boundaries: "fence garden soft",
  vulnerability: "open window curtain",
  loneliness: "person looking out window",
  attachment: "hands holding",
};

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "is", "are", "was", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "should", "could", "may", "might", "shall", "can", "must", "ought", "to", "of",
  "in", "on", "at", "for", "with", "by", "from", "as", "into", "through", "during",
  "this", "that", "these", "those", "i", "you", "he", "she", "it", "we", "they",
  "what", "which", "who", "when", "where", "why", "how", "all", "each", "every",
  "both", "some", "any", "no", "not", "so", "than", "too", "very", "just", "your",
  "their", "our", "my", "his", "her", "its", "our", "your", "more", "most", "less",
  "few", "many", "much", "such", "own", "same", "other", "another", "yourself",
]);

export async function pickClipsForScript(
  script: GeneratedScript,
): Promise<StockClip[][]> {
  // Per-scene: try to fill 2 candidate clips so the renderer can rotate.
  const result: StockClip[][] = [];
  for (const scene of script.body) {
    const keywords = extractKeywords(scene.text);
    const query = pickQuery(keywords);
    const clips = await searchClips(query, scene.seconds);
    result.push(clips);
  }
  return result;
}

export function extractKeywords(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  // Dedupe preserving order, cap at 4.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 4) break;
  }
  return out;
}

function pickQuery(keywords: string[]): string {
  // First try the safelist rewrite for any keyword present.
  for (const k of keywords) {
    if (SAFE_QUERY_REWRITES[k]) return SAFE_QUERY_REWRITES[k];
  }
  // Otherwise just use the first 2 keywords.
  return keywords.slice(0, 2).join(" ") || "calm nature";
}

async function searchClips(query: string, minSeconds: number): Promise<StockClip[]> {
  const out: StockClip[] = [];

  const pexels = await searchPexels(query, minSeconds).catch((e) => {
    console.warn("[stock-clips] Pexels failed:", (e as Error).message);
    return [] as StockClip[];
  });
  out.push(...pexels);

  if (out.length < 2) {
    const pixabay = await searchPixabay(query, minSeconds).catch((e) => {
      console.warn("[stock-clips] Pixabay failed:", (e as Error).message);
      return [] as StockClip[];
    });
    out.push(...pixabay);
  }

  // Cap at 2 candidates per scene.
  return out.slice(0, 2);
}

async function searchPexels(query: string, minSeconds: number): Promise<StockClip[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];

  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(
    query,
  )}&per_page=5&orientation=portrait`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    videos?: Array<{
      id: number;
      width: number;
      height: number;
      duration: number;
      url: string;
      image: string;
      user: { name: string; url: string };
      video_files: Array<{
        link: string;
        width: number;
        height: number;
        file_type: string;
      }>;
    }>;
  };

  const results: StockClip[] = [];
  for (const v of data.videos ?? []) {
    if (v.duration < minSeconds) continue;
    // Pick the smallest mp4 that's at least 720 wide so we don't hammer egress.
    const file = (v.video_files ?? [])
      .filter((f) => f.file_type === "video/mp4" && f.width >= 720)
      .sort((a, b) => a.width - b.width)[0];
    if (!file) continue;
    results.push({
      url: file.link,
      posterUrl: v.image,
      attribution: `${v.user.name} via Pexels`,
      durationSec: v.duration,
      width: file.width,
      height: file.height,
      source: "pexels",
    });
  }
  return results;
}

async function searchPixabay(query: string, minSeconds: number): Promise<StockClip[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];

  const url = `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(
    query,
  )}&per_page=10&safesearch=true`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    hits?: Array<{
      id: number;
      duration: number;
      videos: Record<string, { url: string; width: number; height: number }>;
      user: string;
      pageURL: string;
    }>;
  };

  const results: StockClip[] = [];
  for (const v of data.hits ?? []) {
    if (v.duration < minSeconds) continue;
    // Pixabay returns large/medium/small/tiny; pick medium for portrait.
    const file = v.videos.medium ?? v.videos.small ?? v.videos.tiny;
    if (!file) continue;
    // Skip landscape clips for our 9:16 templates.
    if (file.width > file.height) continue;
    results.push({
      url: file.url,
      posterUrl: null,
      attribution: `${v.user} via Pixabay`,
      durationSec: v.duration,
      width: file.width,
      height: file.height,
      source: "pixabay",
    });
  }
  return results;
}

export function isStockClipsConfigured(): boolean {
  return !!(process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY);
}
