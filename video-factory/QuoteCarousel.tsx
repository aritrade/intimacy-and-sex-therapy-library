/* eslint-disable @next/next/no-img-element */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND } from "./brand";

export type QuoteCarouselSlide = {
  text: string;
  attribution: string | null;
};

export type QuoteCarouselProps = {
  hook: string;
  scenes: QuoteCarouselSlide[];
  cta: string;
  citationLine: string | null;
  language: "en" | "hi" | "hinglish";
  voiceoverUrl: string | null;
  totalSeconds: number;
};

/**
 * 1080x1080 carousel composition. Each "scene" becomes one slide;
 * the renderer can use `renderStill` per-frame at 1-second intervals
 * to export 5–10 PNGs, then upload them as an IG carousel post.
 *
 * For clean per-slide PNG export, slides are 1 second apart starting
 * at frame 0. Slide N occupies frames [N*fps, (N+1)*fps).
 */
export const QuoteCarousel: React.FC<QuoteCarouselProps> = ({
  hook,
  scenes,
  cta,
  citationLine,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const allSlides: QuoteCarouselSlide[] = [
    { text: hook, attribution: null },
    ...scenes,
    { text: cta, attribution: citationLine },
  ];

  const slideIndex = Math.min(Math.floor(frame / fps), allSlides.length - 1);
  const slide = allSlides[slideIndex];

  const isCover = slideIndex === 0;
  const isClose = slideIndex === allSlides.length - 1;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND.bg,
        color: BRAND.ink,
        fontFamily: BRAND.fontSans,
      }}
    >
      <BackgroundOrbs />
      <SlideBody slide={slide} kind={isCover ? "cover" : isClose ? "close" : "body"} />
      <SlideIndicator current={slideIndex + 1} total={allSlides.length} />
      <BrandCorner />
    </AbsoluteFill>
  );
};

const SlideBody: React.FC<{
  slide: QuoteCarouselSlide;
  kind: "cover" | "body" | "close";
}> = ({ slide, kind }) => {
  const fontSize = kind === "cover" ? 84 : kind === "close" ? 64 : 64;
  const color =
    kind === "cover" ? BRAND.warm : kind === "close" ? BRAND.teal : BRAND.ink;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 96 }}>
      <div
        style={{
          fontFamily: BRAND.fontSerif,
          fontSize,
          fontWeight: kind === "cover" ? 700 : 500,
          color,
          lineHeight: 1.18,
          textAlign: "center",
          textWrap: "balance" as React.CSSProperties["textWrap"],
          maxWidth: 880,
        }}
      >
        {slide.text}
      </div>
      {slide.attribution && (
        <div style={{ marginTop: 36, fontSize: 22, color: BRAND.inkMuted, textAlign: "center" }}>
          {slide.attribution}
        </div>
      )}
    </AbsoluteFill>
  );
};

const SlideIndicator: React.FC<{ current: number; total: number }> = ({ current, total }) => (
  <div
    style={{
      position: "absolute",
      top: 36,
      left: 0,
      right: 0,
      display: "flex",
      justifyContent: "center",
      gap: 10,
    }}
  >
    {Array.from({ length: total }).map((_, i) => (
      <div
        key={i}
        style={{
          width: i + 1 === current ? 32 : 12,
          height: 6,
          borderRadius: 3,
          background: i + 1 === current ? BRAND.warm : "rgba(160,160,160,0.4)",
          transition: "all 0.2s",
        }}
      />
    ))}
  </div>
);

const BackgroundOrbs: React.FC = () => {
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
        transform: `translate(${drift(period) * 20}px, ${drift(period * 1.4) * 16}px)`,
      }}
    />
  );
  return (
    <AbsoluteFill>
      {orb(220, 240, 260, BRAND.plum, 220)}
      {orb(900, 800, 320, BRAND.warm, 280)}
      {orb(520, 980, 240, BRAND.teal, 340)}
    </AbsoluteFill>
  );
};

const BrandCorner: React.FC = () => (
  <div
    style={{
      position: "absolute",
      bottom: 36,
      right: 36,
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: BRAND.inkMuted,
      fontSize: 20,
    }}
  >
    <span
      style={{
        display: "grid",
        placeItems: "center",
        width: 36,
        height: 36,
        borderRadius: 10,
        background: `linear-gradient(120deg, ${BRAND.plum}, ${BRAND.warm} 60%, ${BRAND.teal})`,
        color: "#fff",
        fontWeight: 600,
      }}
    >
      {"\u25D0"}
    </span>
    {BRAND.watermark}
  </div>
);
