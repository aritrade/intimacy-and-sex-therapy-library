/* eslint-disable @next/next/no-img-element */
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND, SAFE_AREA } from "./brand";
import { BrandMark } from "./BrandMark";

/**
 * 9:16 PHOTO reel composition.
 *
 * The pragmatic V1 of our short-form visual: narrator voiceover plays
 * over a sequence of stock photos (Pexels / Pixabay) with Ken-Burns
 * motion and gentle crossfades. Hook + CTA bookends use the brand
 * gradient backdrop and surface a small circular narrator-portrait
 * "host badge" so viewers register a face with the voice.
 *
 * Why photos and not the StockReel video path:
 *   - 9:16 portrait stock VIDEOS are scarce on free providers;
 *     orientation filters typically discard 80%+ of hits.
 *   - PHOTOS in portrait are abundant, render ~5x faster than videos
 *     in Remotion (no per-frame decode), and the documentary motion
 *     treatment reads as intentional rather than slideshow-y.
 *
 * Fallback behaviour when a scene has no photos: shows the gradient
 * backdrop with caption text only, so the reel still renders cleanly
 * if Pexels/Pixabay are unconfigured or rate-limited.
 */

export type PhotoReelPhoto = {
  url: string;
  attribution: string | null;
  /** Original dimensions — used to pick the safer pan/zoom direction. */
  width: number;
  height: number;
};

export type PhotoReelScene = {
  text: string;
  seconds: number;
  photos: PhotoReelPhoto[];
};

export type PhotoReelProps = {
  hook: string;
  scenes: PhotoReelScene[];
  cta: string;
  citationLine: string | null;
  language: "en" | "hi" | "hinglish";
  /**
   * Reserved for future use. PhotoReel V1 uses the inline BrandMark
   * logo at hook + CTA instead of the persona portrait — keeps the
   * focus on the brand identity rather than on a single face. The
   * portrait is still committed under /public/brand/narrator.png and
   * is used by AvatarReel (talking-head composition) when that path
   * comes back online.
   */
  portraitUrl?: string | null;
  /** HTTPS URL of the voiceover MP3 (Remotion can't fetch file:// or /public). */
  voiceoverUrl: string | null;
  totalSeconds: number;
};

const CROSSFADE_SECONDS = 0.4;

export const PhotoReel: React.FC<PhotoReelProps> = ({
  hook,
  scenes,
  cta,
  citationLine,
  voiceoverUrl,
  totalSeconds,
}) => {
  const { fps, width, height } = useVideoConfig();
  const totalFrames = Math.ceil(totalSeconds * fps);

  const hookSeconds = Math.max(1.6, Math.min(3, totalSeconds * 0.1));
  const ctaSeconds = Math.max(2, Math.min(4, totalSeconds * 0.12));
  const bodySecondsRaw = scenes.reduce((acc, s) => acc + s.seconds, 0) || 1;
  const bodyScale = (totalSeconds - hookSeconds - ctaSeconds) / bodySecondsRaw;

  // Frame ranges for hook, each body scene, and CTA.
  let cursor = 0;
  const hookRange = { from: 0, durationInFrames: Math.round(hookSeconds * fps) };
  cursor += hookRange.durationInFrames;
  const sceneRanges = scenes.map((s) => {
    const dur = Math.max(1, Math.round(s.seconds * bodyScale * fps));
    const r = { from: cursor, durationInFrames: dur };
    cursor += dur;
    return r;
  });
  const ctaRange = {
    from: cursor,
    durationInFrames: Math.max(1, totalFrames - cursor),
  };

  return (
    <AbsoluteFill
      style={{ backgroundColor: BRAND.bg, color: BRAND.ink, fontFamily: BRAND.fontSans }}
    >
      {/* Hook — branded gradient + hook copy + brand logo badge. */}
      <Sequence from={hookRange.from} durationInFrames={hookRange.durationInFrames}>
        <GradientBg width={width} height={height} />
        <CaptionLayer text={hook} kind="hook" />
        <BrandBadge corner="top-right" />
      </Sequence>

      {/* Body — Ken-Burns photo collage with crossfades + caption. */}
      {scenes.map((scene, i) => (
        <Sequence
          key={i}
          from={sceneRanges[i].from}
          durationInFrames={sceneRanges[i].durationInFrames}
        >
          {scene.photos.length > 0 ? (
            <PhotoCollage
              photos={scene.photos}
              durationFrames={sceneRanges[i].durationInFrames}
              fps={fps}
            />
          ) : (
            <GradientBg width={width} height={height} />
          )}
          {/* Dim strip behind caption so text is always legible regardless
              of the photo's exposure. */}
          <CaptionScrim />
          <CaptionLayer text={scene.text} kind="body" />
          {/* Rotating attribution pill — credits whichever photo is on
              screen RIGHT NOW. Lives inside the scene's local frame so
              it advances with the collage. */}
          <RotatingAttribution
            photos={scene.photos}
            durationFrames={sceneRanges[i].durationInFrames}
            fps={fps}
          />
        </Sequence>
      ))}

      {/* CTA — back to branded gradient + brand logo badge. */}
      <Sequence from={ctaRange.from} durationInFrames={ctaRange.durationInFrames}>
        <GradientBg width={width} height={height} />
        <CaptionLayer text={cta} kind="cta" />
        <BrandBadge corner="top-right" />
      </Sequence>

      {citationLine && <CitationStrip text={citationLine} />}
      <Watermark />

      {voiceoverUrl && <Audio src={voiceoverUrl} />}
    </AbsoluteFill>
  );
};

/**
 * Renders a sequence of photos within a scene with:
 *   - per-photo slot computed by dividing the scene's frames evenly
 *   - 0.4s crossfade between adjacent photos
 *   - alternating Ken-Burns direction (zoom-in / zoom-out, pan left /
 *     pan right) so consecutive photos don't feel identical
 *
 * Photos render via <Img> with objectFit: cover so any aspect-ratio
 * mismatch from the source is absorbed by a center crop.
 */
const PhotoCollage: React.FC<{
  photos: PhotoReelPhoto[];
  durationFrames: number;
  fps: number;
}> = ({ photos, durationFrames, fps }) => {
  const frame = useCurrentFrame();
  const crossfadeFrames = Math.round(CROSSFADE_SECONDS * fps);
  // Each photo "owns" this many frames as its solo time, plus the
  // crossfade frames before + after where it shares the stage with a
  // neighbor.
  const slotFrames = Math.max(
    crossfadeFrames * 2 + 6,
    Math.round(durationFrames / photos.length),
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {photos.map((photo, i) => {
        const start = i * slotFrames;
        const end = start + slotFrames;

        // Crossfade in over the first crossfadeFrames; crossfade out
        // over the last crossfadeFrames. First photo has no fade-in;
        // last has no fade-out (the scene itself bounds it).
        const fadeIn = i === 0 ? 1 : interpolate(
          frame,
          [start, start + crossfadeFrames],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const fadeOut = i === photos.length - 1 ? 1 : interpolate(
          frame,
          [end - crossfadeFrames, end],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const opacity = Math.min(fadeIn, fadeOut);

        if (opacity <= 0) return null;

        return (
          <KenBurnsPhoto
            key={`${photo.url}-${i}`}
            photo={photo}
            startFrame={start}
            durationFrames={slotFrames}
            direction={i % 4}
            opacity={opacity}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/**
 * A single photo with Ken-Burns motion. Direction encodes the variant:
 *   0 -> zoom in, slight pan left
 *   1 -> zoom out, slight pan right
 *   2 -> zoom in, slight pan right
 *   3 -> zoom out, slight pan left
 *
 * Motion is bounded so the center crop never reveals empty letterbox.
 */
const KenBurnsPhoto: React.FC<{
  photo: PhotoReelPhoto;
  startFrame: number;
  durationFrames: number;
  direction: number;
  opacity: number;
}> = ({ photo, startFrame, durationFrames, direction, opacity }) => {
  const frame = useCurrentFrame();
  const local = frame - startFrame;
  const t = Math.max(0, Math.min(1, local / durationFrames));

  const zoomIn = direction === 0 || direction === 2;
  const panRight = direction === 1 || direction === 2;

  const scale = zoomIn ? 1.0 + t * 0.08 : 1.08 - t * 0.08;
  const translateX = panRight ? -16 + t * 32 : 16 - t * 32;
  const translateY = (direction % 2 === 0 ? -1 : 1) * (8 - t * 16);

  return (
    <AbsoluteFill style={{ opacity }}>
      <Img
        src={photo.url}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
          transformOrigin: "center center",
        }}
      />
    </AbsoluteFill>
  );
};

/** Soft top + bottom dim so captions stay readable on bright photos. */
const CaptionScrim: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "linear-gradient(180deg, rgba(16,17,21,0.50) 0%, rgba(16,17,21,0.10) 30%, rgba(16,17,21,0.10) 55%, rgba(16,17,21,0.80) 100%)",
    }}
  />
);

const CaptionLayer: React.FC<{ text: string; kind: "hook" | "body" | "cta" }> = ({
  text,
  kind,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ fps, frame, config: { damping: 200 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const translateY = interpolate(enter, [0, 1], [16, 0]);

  // Body captions sit lower so they don't fight with photo focal points.
  const justify = kind === "body" ? "flex-end" : "center";
  const fontSize = kind === "hook" ? 88 : kind === "cta" ? 74 : 58;
  const weight = kind === "hook" ? 700 : kind === "cta" ? 600 : 500;
  const color =
    kind === "hook" ? BRAND.warm : kind === "cta" ? BRAND.teal : "#ffffff";
  const paddingBottom = kind === "body" ? SAFE_AREA.bottom + 60 : SAFE_AREA.bottom;

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: justify,
        paddingLeft: SAFE_AREA.side,
        paddingRight: SAFE_AREA.side,
        paddingTop: SAFE_AREA.top,
        paddingBottom,
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          fontFamily: BRAND.fontSerif,
          fontSize,
          fontWeight: weight,
          color,
          lineHeight: 1.18,
          textAlign: "center",
          textWrap: "balance" as React.CSSProperties["textWrap"],
          maxWidth: 920,
          textShadow: "0 4px 32px rgba(0,0,0,0.75)",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

const GradientBg: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const frame = useCurrentFrame();
  const drift = (period: number) => Math.sin((frame / period) * Math.PI * 2);
  const orb = (cx: number, cy: number, r: number, color: string, period: number) => (
    <div
      style={{
        position: "absolute",
        left: cx - r,
        top: cy - r,
        width: r * 2,
        height: r * 2,
        borderRadius: "50%",
        background: `radial-gradient(circle at 35% 35%, ${color}aa, transparent 70%)`,
        filter: "blur(60px)",
        transform: `translate(${drift(period) * 30}px, ${drift(period * 1.4) * 24}px)`,
      }}
    />
  );
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      {orb(width * 0.25, height * 0.2, 380, BRAND.plum, 240)}
      {orb(width * 0.85, height * 0.7, 460, BRAND.warm, 300)}
      {orb(width * 0.5, height * 0.95, 360, BRAND.teal, 360)}
    </AbsoluteFill>
  );
};

/**
 * Brand-logo badge shown at hook + CTA only. Anchors the voiceover to
 * a recognisable brand identity rather than to a specific face — keeps
 * the visual focus on the stock photos in body scenes (where the
 * narrator's voice does the talking) and gives the bookend scenes a
 * clean brand stamp.
 *
 * Uses the inline {@link BrandMark} SVG so we never have to upload an
 * external asset to Vercel Blob just for the badge.
 */
const BrandBadge: React.FC<{ corner: "top-right" | "top-left" }> = ({
  corner,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ fps, frame, config: { damping: 18, stiffness: 110 } });
  const scale = interpolate(enter, [0, 1], [0.6, 1]);
  const opacity = interpolate(enter, [0, 1], [0, 1]);

  const positionStyle: React.CSSProperties =
    corner === "top-right"
      ? { right: 56, top: SAFE_AREA.top - 40 }
      : { left: 56, top: SAFE_AREA.top - 40 };

  return (
    <div
      style={{
        position: "absolute",
        ...positionStyle,
        width: 144,
        height: 144,
        borderRadius: "50%",
        boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      <BrandMark size={144} />
    </div>
  );
};

/**
 * Per-scene attribution pill that swaps as photos rotate. Stays small
 * and unobtrusive (top-right, 18px, subtle background) so it credits
 * creators without distracting from the caption.
 */
const RotatingAttribution: React.FC<{
  photos: PhotoReelPhoto[];
  durationFrames: number;
  fps: number;
}> = ({ photos, durationFrames, fps }) => {
  const frame = useCurrentFrame();
  if (photos.length === 0) return null;
  const slotFrames = Math.max(
    Math.round(CROSSFADE_SECONDS * fps) * 2 + 6,
    Math.round(durationFrames / photos.length),
  );
  const idx = Math.min(photos.length - 1, Math.floor(frame / slotFrames));
  const current = photos[idx];
  if (!current?.attribution) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 32,
        top: 32,
        padding: "8px 14px",
        fontSize: 18,
        color: BRAND.inkMuted,
        background: "rgba(16,17,21,0.55)",
        borderRadius: 10,
      }}
    >
      {current.attribution}
    </div>
  );
};

const CitationStrip: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: "absolute",
      left: 48,
      right: 48,
      bottom: 110,
      textAlign: "center",
      color: BRAND.inkMuted,
      fontSize: 24,
      lineHeight: 1.4,
      textShadow: "0 2px 12px rgba(0,0,0,0.6)",
    }}
  >
    {text}
  </div>
);

const Watermark: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: 48,
      bottom: 48,
      display: "flex",
      alignItems: "center",
      gap: 14,
      color: BRAND.inkMuted,
      fontSize: 24,
      textShadow: "0 2px 12px rgba(0,0,0,0.6)",
    }}
  >
    <span
      style={{
        display: "grid",
        placeItems: "center",
        width: 44,
        height: 44,
        borderRadius: 12,
        background: `linear-gradient(120deg, ${BRAND.plum}, ${BRAND.warm} 60%, ${BRAND.teal})`,
        color: "#fff",
        fontWeight: 600,
      }}
    >
      {"\u25D0"}
    </span>
    {BRAND.watermark} · {BRAND.watermarkSuffix}
  </div>
);
