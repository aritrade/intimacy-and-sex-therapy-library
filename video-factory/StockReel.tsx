/* eslint-disable @next/next/no-img-element */
import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND, SAFE_AREA } from "./brand";

export type StockSceneClip = {
  url: string;
  attribution: string | null;
  width: number;
  height: number;
};

export type StockReelScene = {
  text: string;
  seconds: number;
  clips: StockSceneClip[];
};

export type StockReelProps = {
  hook: string;
  scenes: StockReelScene[];
  cta: string;
  citationLine: string | null;
  language: "en" | "hi" | "hinglish";
  voiceoverUrl: string | null;
  totalSeconds: number;
};

/**
 * A 9:16 short-form composition that overlays caption-style text on
 * top of muted stock footage. Same backbone as ShortFormVideo but the
 * background is a sequence of stock clips instead of animated orbs.
 *
 * Behaviour when a scene's `clips` array is empty: falls back to the
 * gradient orbs treatment so the reel still renders.
 */
export const StockReel: React.FC<StockReelProps> = ({
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
  const bodySeconds = scenes.reduce((acc, s) => acc + s.seconds, 0) || 1;
  const bodyScale = (totalSeconds - hookSeconds - ctaSeconds) / bodySeconds;

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
      {/* Hook stays on the gradient backdrop — sets the mood. */}
      <Sequence from={hookRange.from} durationInFrames={hookRange.durationInFrames}>
        <GradientBg width={width} height={height} />
        <CaptionLayer text={hook} kind="hook" />
      </Sequence>

      {/* Body scenes layer stock footage behind on-screen captions. */}
      {scenes.map((s, i) => (
        <Sequence
          key={i}
          from={sceneRanges[i].from}
          durationInFrames={sceneRanges[i].durationInFrames}
        >
          {s.clips[0] ? (
            <ClipBg clip={s.clips[0]} />
          ) : (
            <GradientBg width={width} height={height} />
          )}
          <CaptionLayer text={s.text} kind="body" />
          {s.clips[0]?.attribution && (
            <AttributionPill text={s.clips[0].attribution} />
          )}
        </Sequence>
      ))}

      {/* CTA returns to gradient. */}
      <Sequence from={ctaRange.from} durationInFrames={ctaRange.durationInFrames}>
        <GradientBg width={width} height={height} />
        <CaptionLayer text={cta} kind="cta" />
      </Sequence>

      {citationLine && <CitationStrip text={citationLine} />}
      <Watermark />

      {voiceoverUrl && <Audio src={voiceoverUrl} />}
    </AbsoluteFill>
  );
};

const ClipBg: React.FC<{ clip: StockSceneClip }> = ({ clip }) => {
  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={clip.url}
        muted
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      {/* Top + bottom dim so captions stay readable. */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(16,17,21,0.55) 0%, rgba(16,17,21,0.15) 35%, rgba(16,17,21,0.20) 65%, rgba(16,17,21,0.75) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

const CaptionLayer: React.FC<{ text: string; kind: "hook" | "body" | "cta" }> = ({
  text,
  kind,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ fps, frame, config: { damping: 200 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const translateY = interpolate(enter, [0, 1], [16, 0]);

  const fontSize = kind === "hook" ? 88 : kind === "cta" ? 74 : 62;
  const weight = kind === "hook" ? 700 : kind === "cta" ? 600 : 500;
  const color =
    kind === "hook" ? BRAND.warm : kind === "cta" ? BRAND.teal : BRAND.ink;

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingLeft: SAFE_AREA.side,
        paddingRight: SAFE_AREA.side,
        paddingTop: SAFE_AREA.top,
        paddingBottom: SAFE_AREA.bottom,
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
          textShadow: "0 4px 24px rgba(0,0,0,0.55)",
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

const AttributionPill: React.FC<{ text: string }> = ({ text }) => (
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
    {text}
  </div>
);

const CitationStrip: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: "absolute",
      left: 48,
      right: 48,
      bottom: 110,
      textAlign: "center",
      color: BRAND.inkMuted,
      fontSize: 26,
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
      fontSize: 26,
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
