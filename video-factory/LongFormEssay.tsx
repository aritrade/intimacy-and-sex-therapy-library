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
import { BRAND } from "./brand";
import type { StockSceneClip } from "./StockReel";

export type LongFormChapter = {
  title: string;
  text: string;
  seconds: number;
  clips: StockSceneClip[];
};

export type LongFormEssayProps = {
  hook: string;
  scenes: LongFormChapter[];
  cta: string;
  citationLine: string | null;
  language: "en" | "hi" | "hinglish";
  voiceoverUrl: string | null;
  totalSeconds: number;
};

/**
 * 16:9 long-form essay composition (3-8 minutes). Designed for YouTube
 * upload. Layout:
 *   - Title card with chapter # + chapter title (B-roll behind, dimmed)
 *   - Body lower-third caption
 *   - Citation strip persistent across the bottom
 *
 * The renderer feeds it via the same RenderInput shape (we map the
 * existing GeneratedScript.body[].text -> chapter.text and reuse the
 * scene's first clip for the chapter's B-roll).
 */
export const LongFormEssay: React.FC<LongFormEssayProps> = ({
  hook,
  scenes,
  cta,
  citationLine,
  voiceoverUrl,
  totalSeconds,
}) => {
  const { fps, width, height } = useVideoConfig();
  const totalFrames = Math.ceil(totalSeconds * fps);

  const hookSeconds = Math.max(2, Math.min(6, totalSeconds * 0.06));
  const ctaSeconds = Math.max(3, Math.min(8, totalSeconds * 0.07));
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
    <AbsoluteFill style={{ backgroundColor: BRAND.bg, color: BRAND.ink, fontFamily: BRAND.fontSans }}>
      <Sequence from={hookRange.from} durationInFrames={hookRange.durationInFrames}>
        <GradientBg width={width} height={height} />
        <TitleCard title={hook} subtitle="A reading from the library" />
      </Sequence>

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
          <ChapterMarker number={i + 1} title={s.title || ""} />
          <LowerThird text={s.text} />
          {s.clips[0]?.attribution && <Attribution text={s.clips[0].attribution} />}
        </Sequence>
      ))}

      <Sequence from={ctaRange.from} durationInFrames={ctaRange.durationInFrames}>
        <GradientBg width={width} height={height} />
        <TitleCard title={cta} subtitle={BRAND.domain} />
      </Sequence>

      {citationLine && (
        <div
          style={{
            position: "absolute",
            left: 48,
            right: 48,
            bottom: 36,
            textAlign: "center",
            color: BRAND.inkMuted,
            fontSize: 22,
            lineHeight: 1.4,
            textShadow: "0 2px 12px rgba(0,0,0,0.6)",
          }}
        >
          {citationLine}
        </div>
      )}

      <BrandCorner />

      {voiceoverUrl && <Audio src={voiceoverUrl} />}
    </AbsoluteFill>
  );
};

const ClipBg: React.FC<{ clip: StockSceneClip }> = ({ clip }) => (
  <AbsoluteFill>
    <OffthreadVideo
      src={clip.url}
      muted
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, rgba(16,17,21,0.45) 0%, rgba(16,17,21,0.05) 30%, rgba(16,17,21,0.0) 55%, rgba(16,17,21,0.85) 100%)",
      }}
    />
  </AbsoluteFill>
);

const TitleCard: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ fps, frame, config: { damping: 200 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const translateY = interpolate(enter, [0, 1], [24, 0]);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 96 }}>
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          textAlign: "center",
          maxWidth: 1400,
        }}
      >
        <div
          style={{
            fontFamily: BRAND.fontSerif,
            fontSize: 92,
            fontWeight: 700,
            color: BRAND.warm,
            lineHeight: 1.1,
            marginBottom: 24,
            textShadow: "0 4px 24px rgba(0,0,0,0.55)",
            textWrap: "balance" as React.CSSProperties["textWrap"],
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 30, color: BRAND.inkMuted, letterSpacing: 1.2 }}>
          {subtitle}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ChapterMarker: React.FC<{ number: number; title: string }> = ({ number, title }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ fps, frame, config: { damping: 200 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        top: 56,
        opacity,
        display: "flex",
        alignItems: "center",
        gap: 16,
        color: BRAND.ink,
        fontSize: 28,
        background: "rgba(16,17,21,0.55)",
        padding: "10px 18px",
        borderRadius: 14,
      }}
    >
      <span style={{ color: BRAND.warm, fontWeight: 700 }}>0{number}</span>
      <span style={{ opacity: 0.85 }}>{title || "Chapter"}</span>
    </div>
  );
};

const LowerThird: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ fps, frame, config: { damping: 200 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const translateY = interpolate(enter, [0, 1], [24, 0]);
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        bottom: 110,
        opacity,
        transform: `translateY(${translateY}px)`,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: BRAND.fontSerif,
          fontSize: 54,
          fontWeight: 500,
          color: BRAND.ink,
          lineHeight: 1.25,
          textShadow: "0 4px 20px rgba(0,0,0,0.6)",
          textWrap: "balance" as React.CSSProperties["textWrap"],
          maxWidth: 1500,
          margin: "0 auto",
        }}
      >
        {text}
      </div>
    </div>
  );
};

const Attribution: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: "absolute",
      right: 36,
      top: 56,
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

const BrandCorner: React.FC = () => (
  <div
    style={{
      position: "absolute",
      right: 36,
      bottom: 36,
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: BRAND.inkMuted,
      fontSize: 20,
      textShadow: "0 2px 12px rgba(0,0,0,0.6)",
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
        filter: "blur(80px)",
        transform: `translate(${drift(period) * 40}px, ${drift(period * 1.4) * 30}px)`,
      }}
    />
  );
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      {orb(width * 0.2, height * 0.25, 480, BRAND.plum, 280)}
      {orb(width * 0.85, height * 0.75, 540, BRAND.warm, 320)}
      {orb(width * 0.5, height * 0.95, 420, BRAND.teal, 380)}
    </AbsoluteFill>
  );
};
