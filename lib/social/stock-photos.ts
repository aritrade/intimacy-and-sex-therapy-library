/**
 * Stock-PHOTO selector for the PhotoReel composition.
 *
 * Sibling module to stock-clips.ts. The video variant was constrained by
 * the scarcity of free 9:16 portrait stock clips (most Pexels/Pixabay
 * footage is landscape — our orientation filter discards 80%+ of hits).
 * Stock PHOTOS, by contrast, are abundant in portrait, render much faster
 * in Remotion (no video frame decode), and pair well with a Ken-Burns
 * motion treatment to feel documentary-grade rather than slideshow-y.
 *
 * Two free providers in priority order:
 *   1. Pexels Photos API — 200 req/hr, attribution NOT required (we still
 *      surface it as a small pill out of respect for creators).
 *   2. Pixabay Photos API — 5K req/hr, attribution NOT required.
 *
 * Calling pattern:
 *   await pickPhotosForScript(script, 3)
 *      -> per-scene array of { url, attribution, width, height, source }
 *
 * We reuse the keyword extractor + safelist rewrites from stock-clips.ts
 * so the videos and photos pipelines stay in sync on what query maps to
 * what (e.g. "intimacy" -> "couple holding hands").
 *
 * Returns an empty array when no provider key is configured. Callers
 * should fall back to the gradient backdrop in that case.
 */

import type { GeneratedScript } from "./script-generator";
import { extractKeywords } from "./stock-clips";

export type StockPhoto = {
  /** Direct HTTPS URL of a JPEG/PNG. Sized for 1080p use. */
  url: string;
  attribution: string | null;
  width: number;
  height: number;
  source: "pexels" | "pixabay";
};

/**
 * Domain-tuned safelist of search queries. Two reasons it exists:
 *   1. Many of our scene keywords (sex, desire, arousal, trauma) would
 *      surface NSFW or auto-moderated photos on stock sites. We rewrite
 *      to neutral metaphor queries so renders are always publish-safe
 *      on Meta/YouTube without manual review.
 *   2. We want a consistent visual register — soft natural light, hands,
 *      objects, settings — rather than the model-shoot energy default
 *      stock searches return.
 */
const SAFE_QUERY_REWRITES: Record<string, string> = {
  intimacy: "hands holding warm light",
  sex: "soft bedroom morning light",
  desire: "candle flame warm room",
  arousal: "heartbeat warm tones abstract",
  trauma: "soft sunlight curtain",
  shame: "rain window blurred",
  anxiety: "calm breathing hands",
  partner: "couple walking sunset",
  body: "yoga mat plant window",
  pleasure: "warm tea steam ceramic",
  consent: "two coffee cups conversation",
  boundaries: "garden fence morning",
  vulnerability: "open window curtain breeze",
  loneliness: "single chair by window",
  attachment: "hands held close",
  relationship: "couple silhouette sunset",
  therapy: "notebook pen warm light",
  communication: "handwritten letter coffee",
  pleasure_anatomy: "anatomy textbook desk",
  hormones: "abstract waves warm",
  cycle: "moon phases warm tones",
  polyamory: "three coffee mugs table",
  monogamy: "two hands wedding rings",
  orgasm: "abstract warm wave motion",
  libido: "abstract warm energy",
};

export async function pickPhotosForScript(
  script: GeneratedScript,
  photosPerScene = 3,
): Promise<StockPhoto[][]> {
  const out: StockPhoto[][] = [];
  for (const scene of script.body) {
    const keywords = extractKeywords(scene.text);
    const query = pickQuery(keywords);
    const photos = await searchPhotos(query, photosPerScene);
    out.push(photos);
  }
  return out;
}

function pickQuery(keywords: string[]): string {
  // Safelist rewrite wins if any scene keyword matches a known sensitive term.
  for (const k of keywords) {
    if (SAFE_QUERY_REWRITES[k]) return SAFE_QUERY_REWRITES[k];
  }
  // Otherwise stitch the first 2 keywords. Most Pexels/Pixabay photo
  // searches do better with 2-word queries than long ones.
  return keywords.slice(0, 2).join(" ") || "warm sunlight window";
}

async function searchPhotos(query: string, count: number): Promise<StockPhoto[]> {
  const out: StockPhoto[] = [];

  const pexels = await searchPexelsPhotos(query, count).catch((e) => {
    console.warn("[stock-photos] Pexels failed:", (e as Error).message);
    return [] as StockPhoto[];
  });
  out.push(...pexels);

  if (out.length < count) {
    const pixabay = await searchPixabayPhotos(query, count - out.length).catch((e) => {
      console.warn("[stock-photos] Pixabay failed:", (e as Error).message);
      return [] as StockPhoto[];
    });
    out.push(...pixabay);
  }

  return out.slice(0, count);
}

async function searchPexelsPhotos(query: string, count: number): Promise<StockPhoto[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];

  // per_page request a few extras so we can filter down to "tall enough"
  // hits without spending another roundtrip when most candidates are
  // borderline landscape.
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(
    query,
  )}&per_page=${Math.min(15, count * 4)}&orientation=portrait&size=large`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    photos?: Array<{
      id: number;
      width: number;
      height: number;
      photographer: string;
      url: string;
      src: {
        original: string;
        large2x: string;
        large: string;
        portrait: string;
      };
    }>;
  };

  const results: StockPhoto[] = [];
  for (const p of data.photos ?? []) {
    // Skip anything that's too square — we want at least 1.3:1 height so
    // the 1080×1920 cover crop doesn't slice off important content.
    if (p.height / p.width < 1.2) continue;
    // Pexels "portrait" preset returns 800×1200 tightly cropped, "large"
    // preserves natural aspect at ~940px wide, "large2x" is 1880px wide.
    // We want enough resolution for a 1080-wide cover crop without
    // upscaling artifacts; large2x is the sweet spot.
    const photoUrl = p.src.large2x ?? p.src.original ?? p.src.large;
    if (!photoUrl) continue;
    results.push({
      url: photoUrl,
      attribution: `${p.photographer} via Pexels`,
      width: p.width,
      height: p.height,
      source: "pexels",
    });
  }
  return results;
}

async function searchPixabayPhotos(query: string, count: number): Promise<StockPhoto[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];

  // image_type=photo excludes illustrations and vectors; orientation=vertical
  // is Pixabay's term for 9:16-ish; safesearch=true is conservative on this
  // domain — we already pre-filter via SAFE_QUERY_REWRITES but defence in
  // depth is cheap.
  const url =
    `https://pixabay.com/api/?key=${key}` +
    `&q=${encodeURIComponent(query)}` +
    `&image_type=photo&orientation=vertical&safesearch=true` +
    `&per_page=${Math.min(20, Math.max(3, count * 4))}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    hits?: Array<{
      id: number;
      tags: string;
      user: string;
      imageWidth: number;
      imageHeight: number;
      largeImageURL?: string;
      webformatURL?: string;
    }>;
  };

  const results: StockPhoto[] = [];
  for (const h of data.hits ?? []) {
    if (h.imageHeight / h.imageWidth < 1.2) continue;
    const photoUrl = h.largeImageURL ?? h.webformatURL;
    if (!photoUrl) continue;
    results.push({
      url: photoUrl,
      attribution: `${h.user} via Pixabay`,
      width: h.imageWidth,
      height: h.imageHeight,
      source: "pixabay",
    });
  }
  return results;
}

export function isStockPhotosConfigured(): boolean {
  return !!(process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY);
}
