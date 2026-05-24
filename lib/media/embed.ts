/**
 * Resolve a resource's `externalUrl` into a safe in-app player.
 *
 * - YouTube  -> https://www.youtube-nocookie.com/embed/<id> (privacy-respecting)
 * - TED      -> https://embed.ted.com/talks/<slug>
 * - Vimeo    -> https://player.vimeo.com/video/<id>
 * - PMC PDF  -> server-side PDF object (handled by /library/[id], not here)
 *
 * If the host isn't recognised we return null so the caller can fall back
 * to a "Watch at source" thumbnail card. We never iframe arbitrary HTML.
 */

export type EmbedDescriptor = {
  provider: "youtube" | "ted" | "vimeo";
  embedUrl: string;
  thumbnailUrl: string | null;
  /** Best-effort minutes label from URL params, when known. */
  durationLabel?: string;
};

function ytIdFromUrl(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return u.pathname.replace(/^\//, "") || null;
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] ?? null;
    if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] ?? null;
    return u.searchParams.get("v");
  }
  return null;
}

function tedSlugFromUrl(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host !== "ted.com") return null;
  // Canonical: /talks/<slug>
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0] !== "talks" || !parts[1]) return null;
  return parts[1];
}

function vimeoIdFromUrl(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
  const m = u.pathname.match(/\/(\d{5,})/);
  return m?.[1] ?? null;
}

export function resolveEmbed(externalUrl: string | null | undefined): EmbedDescriptor | null {
  if (!externalUrl) return null;
  let u: URL;
  try {
    u = new URL(externalUrl);
  } catch {
    return null;
  }

  const yt = ytIdFromUrl(u);
  if (yt) {
    return {
      provider: "youtube",
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}?rel=0&modestbranding=1`,
      thumbnailUrl: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
    };
  }

  const ted = tedSlugFromUrl(u);
  if (ted) {
    return {
      provider: "ted",
      embedUrl: `https://embed.ted.com/talks/${ted}`,
      // TED.com serves OG images at a stable path; we can fallback to null.
      thumbnailUrl: null,
    };
  }

  const vim = vimeoIdFromUrl(u);
  if (vim) {
    return {
      provider: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${vim}`,
      thumbnailUrl: null,
    };
  }

  return null;
}

/**
 * Heuristic: estimate reading time in minutes from a chunk of prose.
 * Uses 220 wpm — typical adult reading speed. Floor at 1.
 */
export function readingMinutes(text: string | null | undefined): number {
  if (!text) return 1;
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}
