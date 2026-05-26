import React from "react";
import { BRAND } from "./brand";

/**
 * The Intimacy & Sex Therapy Library brand mark — inline SVG so it
 * renders crisply at any size inside Remotion (no HTTPS roundtrip
 * needed, no image-decode cost). Mirrors public/brand/logo.svg
 * one-to-one; keep them in lockstep when iterating.
 *
 * Why a single open-book + heart glyph:
 *   - open book → "library", evidence-grounded, clinical
 *   - small warm heart on the spine → "intimacy", relational
 *   - brand-gradient disc → visual identity continuous with the
 *     watermark in the lower-left of every reel
 *
 * Used in:
 *   - PhotoReel — hook + CTA host badge (replaces narrator portrait)
 *   - any future reel composition that wants a brand-anchored badge
 *
 * Sized via `size` prop in CSS pixels; everything inside scales by
 * the 512-unit viewBox so the strokes / heart / gradient remain
 * pixel-perfect.
 */
export const BrandMark: React.FC<{ size: number }> = ({ size }) => {
  const grad = `brand-grad-${Math.round(size)}`;
  const glow = `brand-glow-${Math.round(size)}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Intimacy & Sex Therapy Library"
    >
      <defs>
        <linearGradient id={grad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={BRAND.plum} />
          <stop offset="55%" stopColor={BRAND.warm} />
          <stop offset="100%" stopColor={BRAND.teal} />
        </linearGradient>
        <radialGradient id={glow} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.22} />
          <stop offset="55%" stopColor="#FFFFFF" stopOpacity={0} />
        </radialGradient>
      </defs>

      <circle cx="256" cy="256" r="248" fill="#F8F6F2" />
      <circle cx="256" cy="256" r="232" fill={`url(#${grad})`} />
      <circle cx="256" cy="256" r="232" fill={`url(#${glow})`} />

      {/* Open book — two pages meeting at a central spine. */}
      <g stroke="#FFFFFF" strokeLinejoin="round" strokeWidth={6}>
        <path
          d="M 252 196 L 252 380 L 162 360 Q 132 354 132 322 L 132 200 Q 132 178 162 174 Q 220 168 252 196 Z"
          fill="#F8F6F2"
        />
        <path
          d="M 260 196 L 260 380 L 350 360 Q 380 354 380 322 L 380 200 Q 380 178 350 174 Q 292 168 260 196 Z"
          fill="#F8F6F2"
        />
      </g>

      {/* Left page lines (warm). */}
      <g
        stroke={BRAND.warm}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
        opacity={0.85}
      >
        <line x1="160" y1="226" x2="232" y2="222" />
        <line x1="160" y1="258" x2="232" y2="254" />
        <line x1="160" y1="290" x2="232" y2="286" />
        <line x1="160" y1="322" x2="216" y2="318" />
      </g>

      {/* Right page lines (teal). */}
      <g
        stroke={BRAND.teal}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
        opacity={0.85}
      >
        <line x1="280" y1="222" x2="352" y2="226" />
        <line x1="280" y1="254" x2="352" y2="258" />
        <line x1="280" y1="286" x2="352" y2="290" />
        <line x1="296" y1="318" x2="352" y2="322" />
      </g>

      {/* Warm heart resting on the spine. */}
      <path
        d="M 256 154
           C 244 138 224 138 218 158
           C 212 178 240 200 256 214
           C 272 200 300 178 294 158
           C 288 138 268 138 256 154 Z"
        fill={BRAND.warm}
        stroke="#F8F6F2"
        strokeWidth={5}
        strokeLinejoin="round"
      />
    </svg>
  );
};
