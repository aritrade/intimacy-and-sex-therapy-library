/* eslint-disable @next/next/no-img-element */
import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export type ShortFormScene = { text: string; seconds: number };

export type ShortFormProps = {
  hook: string;
  scenes: ShortFormScene[];
  cta: string;
  citationLine: string | null;
  language: "en" | "hi" | "hinglish";
  voiceoverUrl: string | null;
  totalSeconds: number;
};

const COLORS = {
  bg: "#101115",
  ink: "#F0EBE2",
  muted: "#9E988A",
  accent: "#8e b8a8",
  warm: "#e07a5f",
  plum: "#8a567e",
  teal: "#479191",
};

export const ShortFormVideo: React.FC<ShortFormProps> = ({
  hook,
  scenes,
  cta,
  citationLine,
  voiceoverUrl,
  totalSeconds,
}) => {
  const { fps, width, height } = useVideoConfig();
  const totalFrames = Math.ceil(totalSeconds * fps);

  // Build per-scene frame ranges. Hook gets ~10% of total time, CTA ~12%,
  // body scenes the rest distributed by their declared seconds.
  const hookSeconds = Math.max(1.6, Math.min(3, totalSeconds * 0.1));
  const ctaSeconds = Math.max(2, Math.min(4, totalSeconds * 0.12));
  const bodySeconds = scenes.reduce((acc, s) => acc + s.seconds, 0) || (totalSeconds - hookSeconds - ctaSeconds);
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
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, color: COLORS.ink, fontFamily: "Inter, ui-sans-serif" }}>
      <BackgroundOrbs width={width} height={height} />

      {/* Hook */}
      <Sequence from={hookRange.from} durationInFrames={hookRange.durationInFrames}>
        <CenteredText text={hook} kind="hook" />
      </Sequence>

      {/* Body scenes */}
      {scenes.map((s, i) => (
        <Sequence key={i} from={sceneRanges[i].from} durationInFrames={sceneRanges[i].durationInFrames}>
          <CenteredText text={s.text} kind="body" />
        </Sequence>
      ))}

      {/* CTA */}
      <Sequence from={ctaRange.from} durationInFrames={ctaRange.durationInFrames}>
        <CenteredText text={cta} kind="cta" />
      </Sequence>

      {/* Citation strip — visible the whole time */}
      {citationLine && (
        <div
          style={{
            position: "absolute",
            left: 48,
            right: 48,
            bottom: 110,
            textAlign: "center",
            color: COLORS.muted,
            fontSize: 26,
            lineHeight: 1.4,
          }}
        >
          {citationLine}
        </div>
      )}

      {/* Brand watermark */}
      <Watermark />

      {voiceoverUrl && <Audio src={voiceoverUrl} />}
    </AbsoluteFill>
  );
};

const CenteredText: React.FC<{ text: string; kind: "hook" | "body" | "cta" }> = ({ text, kind }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ fps, frame, config: { damping: 200 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const translateY = interpolate(enter, [0, 1], [16, 0]);

  const fontSize = kind === "hook" ? 88 : kind === "cta" ? 72 : 60;
  const weight = kind === "hook" ? 700 : kind === "cta" ? 600 : 500;
  const color =
    kind === "hook" ? COLORS.warm : kind === "cta" ? COLORS.teal : COLORS.ink;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          fontFamily: "Lora, ui-serif, Georgia",
          fontSize,
          fontWeight: weight,
          color,
          lineHeight: 1.15,
          textAlign: "center",
          textWrap: "balance" as React.CSSProperties["textWrap"],
          maxWidth: 900,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

const BackgroundOrbs: React.FC<{ width: number; height: number }> = ({ width, height }) => {
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
    <AbsoluteFill>
      {orb(width * 0.25, height * 0.2, 380, COLORS.plum, 240)}
      {orb(width * 0.85, height * 0.7, 460, COLORS.warm, 300)}
      {orb(width * 0.5, height * 0.95, 360, COLORS.teal, 360)}
    </AbsoluteFill>
  );
};

const Watermark: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: 48,
      bottom: 48,
      display: "flex",
      alignItems: "center",
      gap: 14,
      color: COLORS.muted,
      fontSize: 26,
    }}
  >
    <span
      style={{
        display: "grid",
        placeItems: "center",
        width: 44,
        height: 44,
        borderRadius: 12,
        background: `linear-gradient(120deg, ${COLORS.plum}, ${COLORS.warm} 60%, ${COLORS.teal})`,
        color: "#fff",
        fontWeight: 600,
      }}
    >
      ◐
    </span>
    Intimacy & Sex Therapy Library · 18+
  </div>
);
