/**
 * Renderer-side brand tokens for every Remotion composition.
 *
 * Re-exports the canonical palette from `lib/brand/tokens.ts` so that
 * the website and the auto-generated videos stay visually aligned.
 * If you need to tweak colours, do it in lib/brand/tokens.ts and the
 * matching --c-* variables in app/globals.css.
 */

import { BRAND_RENDER_PALETTE, BRAND_FONTS, BRAND_COPY } from "../lib/brand/tokens";

export const BRAND = {
  bg: BRAND_RENDER_PALETTE.bg,
  surface: BRAND_RENDER_PALETTE.surface,
  ink: BRAND_RENDER_PALETTE.ink,
  inkMuted: BRAND_RENDER_PALETTE.inkMuted,
  accent: BRAND_RENDER_PALETTE.accent,
  warm: BRAND_RENDER_PALETTE.warm,
  plum: BRAND_RENDER_PALETTE.plum,
  teal: BRAND_RENDER_PALETTE.teal,
  gradient: BRAND_RENDER_PALETTE.gradient,

  fontSerif: BRAND_FONTS.serif,
  fontSans: BRAND_FONTS.sans,

  watermark: BRAND_COPY.fullName,
  watermarkSuffix: BRAND_COPY.watermarkSuffix,
  domain: BRAND_COPY.domain,
} as const;

export const SAFE_AREA = {
  top: 220, // status bar + IG/YT chrome
  bottom: 320, // captions, like/share/comment buttons
  side: 80,
} as const;
