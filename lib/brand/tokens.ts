/**
 * Canonical brand tokens.
 *
 * Single source of truth for ANY surface that wants the brand
 * palette / typography:
 *   - Remotion templates (video-factory/) — import from here.
 *   - Open-graph / social-card image generation.
 *   - Future React Server Component cards that don't have access
 *     to Tailwind CSS variables (e.g. server-side @vercel/og).
 *
 * The matching CSS variables live in app/globals.css. Keeping the
 * pairs in sync is currently manual; if these drift, the website and
 * the auto-generated videos will look like different products. Tests
 * in tests/integration/brand-parity.test.ts (TODO) will catch drift
 * by reading globals.css and comparing.
 *
 * RGB triples are kept as strings to match the CSS-var convention
 * `rgb(var(--c-warm))`. Hex strings are also exposed for places that
 * can't compose `rgb(...)` (e.g. linear-gradient strings inside a
 * style prop on a Remotion comp).
 */

export const BRAND_RGB = {
  bg_light: "248 246 242",
  bg_dark: "16 17 21",
  ink_light: "36 31 21",
  ink_dark: "240 235 226",
  ink_muted_light: "138 130 115",
  ink_muted_dark: "158 152 138",
  warm: "224 122 95", // #e07a5f
  plum_light: "138 86 126",
  plum_dark: "196 144 184",
  teal_light: "71 145 145",
  teal_dark: "124 197 197",
  accent: "142 184 168", // #8eb8a8
} as const;

export const BRAND_HEX = {
  bg_light: "#F8F6F2",
  bg_dark: "#101115",
  surface_dark: "#181922",
  ink_light: "#241F15",
  ink_dark: "#F0EBE2",
  ink_muted_light: "#8A8273",
  ink_muted_dark: "#9E988A",
  warm: "#E07A5F",
  plum_light: "#8A567E",
  plum_dark: "#C490B8",
  teal_light: "#479191",
  teal_dark: "#7CC5C5",
  accent: "#8EB8A8",
} as const;

export const BRAND_FONTS = {
  serif: "Lora, ui-serif, Georgia, 'Times New Roman', serif",
  sans: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
} as const;

export const BRAND_COPY = {
  fullName: "Intimacy & Sex Therapy Library",
  shortName: "Intimacy & Sex Library",
  ultraShort: "ISTL",
  watermarkSuffix: "18+",
  domain: "intimacy-and-sex-therapy-library.vercel.app",
  url: "https://intimacy-and-sex-therapy-library.vercel.app",
  tagline: "Evidence-grounded sex therapy. Clinician-reviewed. Human-paced.",
  ageGate: "18+ · educational",
} as const;

/** Convenience: gradient stops used in nav logo + reel watermarks. */
export const BRAND_GRADIENT_STOPS = [
  BRAND_HEX.plum_light,
  BRAND_HEX.warm,
  BRAND_HEX.teal_light,
] as const;

/**
 * Recommended renderer palette. Defaults to the dark mode (videos
 * are watched on phones, mostly at night, so dark wins). The video
 * factory is hardcoded to dark; this constant is here for clarity.
 */
export const BRAND_RENDER_PALETTE = {
  bg: BRAND_HEX.bg_dark,
  surface: BRAND_HEX.surface_dark,
  ink: BRAND_HEX.ink_dark,
  inkMuted: BRAND_HEX.ink_muted_dark,
  accent: BRAND_HEX.accent,
  warm: BRAND_HEX.warm,
  plum: BRAND_HEX.plum_light,
  teal: BRAND_HEX.teal_light,
  gradient: BRAND_GRADIENT_STOPS,
} as const;
