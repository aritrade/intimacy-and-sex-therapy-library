/**
 * Primer.tsx — the homepage "Watch a 5-minute primer" film.
 *
 * A cinematic, motion-design walkthrough of the Intimacy & Sex Therapy
 * Library. Unlike the social reels (dark, phone-first), the primer uses the
 * warm LIGHT brand palette and is built as one continuous emotional arc:
 * a slow, safe open → a privacy promise → a gentle tour of each surface →
 * an uplifting close.
 *
 * Everything moves. A single drifting-light background and a soft particle
 * field run UNINTERRUPTED beneath every scene (placed outside the Sequences
 * so they never reset), while each scene layers kinetic typography, cards
 * that pop and settle, a self-typing search bar, sliding chat bubbles, an
 * animated trend line and a myth→fact reveal on top.
 *
 * Timing is data-driven: scripts/render-primer.ts feeds per-scene seconds
 * from marketing/primer/timings.json so the visuals land exactly on the
 * narration (muxed on after a silent render — Remotion never touches audio).
 */
import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadLora } from "@remotion/google-fonts/Lora";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const { fontFamily: SERIF } = loadLora("normal", { weights: ["500", "600", "700"] });
const { fontFamily: SANS } = loadInter("normal", { weights: ["400", "500", "600"] });

/* Warm light palette — matches the homepage the viewer lands on. */
const C = {
  bg: "#F5EEDF",
  bgDeep: "#EFE6D2",
  ink: "#1C140F",
  inkSoft: "rgba(28,20,15,0.66)",
  inkFaint: "rgba(28,20,15,0.40)",
  warm: "#C96A4B",
  plum: "#7A4E7C",
  teal: "#3F7E7A",
  green: "#6E9A86",
  surface: "rgba(255,255,255,0.74)",
  surfaceSolid: "#FBF7EE",
  line: "rgba(28,20,15,0.10)",
};
const ACCENT: Record<string, string> = { warm: C.warm, plum: C.plum, teal: C.teal, green: C.green };

export type PrimerSceneData = {
  id: string;
  kind: string;
  seconds: number;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  pills?: string[];
  cards?: { accent: string; icon: string; heading: string; body: string }[];
  chat?: { me: boolean; text: string }[];
  query?: string;
  answer?: string;
  items?: string[];
  mythText?: string;
  factText?: string;
  wordmark?: string;
  domain?: string;
};

export type PrimerProps = {
  scenes: PrimerSceneData[];
  totalSeconds: number;
};

/* ----------------------------------------------------------------- helpers */

const Reveal: React.FC<{
  delay?: number;
  y?: number;
  scaleFrom?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, y = 24, scaleFrom = 1, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ fps, frame: frame - delay, config: { damping: 200, mass: 0.85 } });
  const opacity = interpolate(s, [0, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const translateY = interpolate(s, [0, 1], [y, 0]);
  const scale = interpolate(s, [0, 1], [scaleFrom, 1]);
  return (
    <div style={{ opacity, transform: `translateY(${translateY}px) scale(${scale})`, ...style }}>
      {children}
    </div>
  );
};

const SceneFrame: React.FC<{ durationInFrames: number; children: React.ReactNode }> = ({
  durationInFrames,
  children,
}) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - 16, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);
  const scale = interpolate(frame, [0, 26], [1.015, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `scale(${scale})`,
        alignItems: "center",
        justifyContent: "center",
        padding: "0 150px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 1520, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {children}
      </div>
    </AbsoluteFill>
  );
};

const Eyebrow: React.FC<{ text: string; accent?: string }> = ({ text, accent = C.warm }) => (
  <Reveal delay={2} y={14}>
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 26 }}>
      <span style={{ width: 38, height: 2, background: accent, borderRadius: 2 }} />
      <span
        style={{
          fontFamily: SANS,
          fontSize: 22,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: accent,
          fontWeight: 600,
        }}
      >
        {text}
      </span>
      <span style={{ width: 38, height: 2, background: accent, borderRadius: 2 }} />
    </div>
  </Reveal>
);

const KineticTitle: React.FC<{ text: string; size?: number; base?: number; align?: "center" | "left" }> = ({
  text,
  size = 80,
  base = 8,
  align = "center",
}) => {
  const lines = text.split("\n");
  let w = 0;
  return (
    <div style={{ textAlign: align, marginBottom: 24 }}>
      {lines.map((line, li) => (
        <div
          key={li}
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: align === "center" ? "center" : "flex-start",
            gap: "0 18px",
            lineHeight: 1.12,
          }}
        >
          {line.split(" ").map((word, wi) => {
            const delay = base + w * 2.2;
            w += 1;
            return (
              <Reveal key={wi} delay={delay} y={30} style={{ display: "inline-block" }}>
                <span
                  style={{
                    fontFamily: SERIF,
                    fontSize: size,
                    fontWeight: 600,
                    color: C.ink,
                    letterSpacing: -0.5,
                  }}
                >
                  {word}
                </span>
              </Reveal>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const Subtitle: React.FC<{ text: string; delay?: number; max?: number }> = ({
  text,
  delay = 26,
  max = 1080,
}) => (
  <Reveal delay={delay} y={18}>
    <p
      style={{
        fontFamily: SANS,
        fontSize: 31,
        lineHeight: 1.5,
        color: C.inkSoft,
        textAlign: "center",
        maxWidth: max,
        margin: "0 auto",
        fontWeight: 400,
      }}
    >
      {text}
    </p>
  </Reveal>
);

const Icon: React.FC<{ name: string; color: string; size?: number }> = ({ name, color, size = 26 }) => {
  const p = { fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, React.ReactNode> = {
    lock: (<><rect x="5" y="11" width="14" height="9" rx="2" {...p} /><path d="M8 11V8a4 4 0 0 1 8 0v3" {...p} /></>),
    noTrack: (<><circle cx="12" cy="12" r="8" {...p} /><path d="M6 6l12 12" {...p} /></>),
    vault: (<><rect x="4" y="5" width="16" height="14" rx="2" {...p} /><circle cx="12" cy="12" r="3.2" {...p} /><path d="M12 5v2M12 17v2" {...p} /></>),
    pin: (<><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" {...p} /><circle cx="12" cy="10" r="2.4" {...p} /></>),
    dot: (<circle cx="12" cy="12" r="4.5" fill={color} stroke="none" />),
    search: (<><circle cx="11" cy="11" r="6.5" {...p} /><path d="M16 16l4 4" {...p} /></>),
    check: (<path d="M5 12.5l4.5 4.5L19 7" {...p} />),
    shield: (<path d="M12 3l7 3v6c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6l7-3Z" {...p} />),
    spark: (<path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8L12 4Z" {...p} />),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      {paths[name] ?? paths.dot}
    </svg>
  );
};

const IconBadge: React.FC<{ name: string; accent: string; size?: number }> = ({ name, accent, size = 58 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: 16,
      display: "grid",
      placeItems: "center",
      background: `${accent}1f`,
      border: `1px solid ${accent}40`,
    }}
  >
    <Icon name={name} color={accent} size={size * 0.46} />
  </div>
);

const cardStyle: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.line}`,
  borderRadius: 24,
  boxShadow: "0 24px 60px -36px rgba(28,20,15,0.45)",
};

/* ----------------------------------------------------------------- scenes */

const HeroScene: React.FC<{ s: PrimerSceneData }> = ({ s }) => (
  <>
    {s.eyebrow && <Eyebrow text={s.eyebrow} accent={C.plum} />}
    <KineticTitle text={s.title ?? ""} size={84} />
    {s.subtitle && <Subtitle text={s.subtitle} delay={(s.title ?? "").split(" ").length * 2.2 + 14} />}
  </>
);

const PillsScene: React.FC<{ s: PrimerSceneData }> = ({ s }) => (
  <>
    {s.eyebrow && <Eyebrow text={s.eyebrow} accent={C.teal} />}
    <KineticTitle text={s.title ?? ""} size={74} />
    {s.subtitle && <Subtitle text={s.subtitle} delay={30} max={1120} />}
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 18, marginTop: 44 }}>
      {(s.pills ?? []).map((p, i) => (
        <Reveal key={i} delay={42 + i * 6} y={20} scaleFrom={0.9}>
          <div
            style={{
              ...cardStyle,
              borderRadius: 999,
              padding: "16px 30px",
              fontFamily: SANS,
              fontSize: 27,
              fontWeight: 500,
              color: C.ink,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Icon name="check" color={C.green} size={22} />
            {p}
          </div>
        </Reveal>
      ))}
    </div>
  </>
);

const CardsScene: React.FC<{ s: PrimerSceneData }> = ({ s }) => (
  <>
    {s.eyebrow && <Eyebrow text={s.eyebrow} accent={C.warm} />}
    <KineticTitle text={s.title ?? ""} size={72} />
    {s.subtitle && <Subtitle text={s.subtitle} delay={28} max={1100} />}
    <div style={{ display: "flex", gap: 28, marginTop: 48, width: "100%" }}>
      {(s.cards ?? []).map((c, i) => {
        const accent = ACCENT[c.accent] ?? C.warm;
        return (
          <Reveal key={i} delay={40 + i * 8} y={28} scaleFrom={0.94} style={{ flex: 1 }}>
            <div style={{ ...cardStyle, padding: 34, height: "100%" }}>
              <IconBadge name={c.icon} accent={accent} />
              <div
                style={{
                  fontFamily: SERIF,
                  fontSize: 30,
                  fontWeight: 600,
                  color: C.ink,
                  margin: "22px 0 12px",
                }}
              >
                {c.heading}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 22, lineHeight: 1.5, color: C.inkSoft }}>{c.body}</div>
            </div>
          </Reveal>
        );
      })}
    </div>
  </>
);

const SearchScene: React.FC<{ s: PrimerSceneData }> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const query = s.query ?? "";
  const typeStart = 38;
  const typeDur = fps * 2.2;
  const prog = interpolate(frame, [typeStart, typeStart + typeDur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shown = query.slice(0, Math.floor(prog * query.length));
  const caretOn = Math.floor(frame / 16) % 2 === 0;
  const doneFrame = typeStart + typeDur;
  const chips = ["Talking about desire", "When desire differs", "Asexual spectrum 101"];
  return (
    <>
      {s.eyebrow && <Eyebrow text={s.eyebrow} accent={C.teal} />}
      <KineticTitle text={s.title ?? ""} size={74} />
      {s.subtitle && <Subtitle text={s.subtitle} delay={28} max={1120} />}
      <Reveal delay={34} y={24} scaleFrom={0.96} style={{ width: "100%", maxWidth: 1120, marginTop: 46 }}>
        <div
          style={{
            ...cardStyle,
            borderRadius: 999,
            padding: "22px 34px",
            display: "flex",
            alignItems: "center",
            gap: 18,
          }}
        >
          <Icon name="search" color={C.inkFaint} size={30} />
          <span style={{ fontFamily: SANS, fontSize: 30, color: C.ink }}>
            {shown || (frame < typeStart ? "" : "")}
            <span style={{ opacity: caretOn ? 1 : 0, color: C.teal, fontWeight: 600 }}>|</span>
          </span>
        </div>
      </Reveal>
      <div style={{ display: "flex", gap: 16, marginTop: 30, flexWrap: "wrap", justifyContent: "center" }}>
        {chips.map((c, i) => (
          <Reveal key={i} delay={doneFrame + 6 + i * 7} y={16} scaleFrom={0.9}>
            <div
              style={{
                background: `${C.teal}14`,
                border: `1px solid ${C.teal}38`,
                borderRadius: 999,
                padding: "12px 24px",
                fontFamily: SANS,
                fontSize: 23,
                color: C.teal,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Icon name="spark" color={C.teal} size={18} />
              {c}
            </div>
          </Reveal>
        ))}
      </div>
    </>
  );
};

const ChatScene: React.FC<{ s: PrimerSceneData }> = ({ s }) => (
  <>
    {s.eyebrow && <Eyebrow text={s.eyebrow} accent={C.plum} />}
    <KineticTitle text={s.title ?? ""} size={72} />
    {s.subtitle && <Subtitle text={s.subtitle} delay={28} max={1080} />}
    <div style={{ width: "100%", maxWidth: 1080, marginTop: 46, display: "flex", flexDirection: "column", gap: 22 }}>
      {(s.chat ?? []).map((m, i) => (
        <Reveal
          key={i}
          delay={40 + i * 16}
          y={18}
          style={{ alignSelf: m.me ? "flex-end" : "flex-start", maxWidth: "82%" }}
        >
          <div
            style={{
              ...cardStyle,
              background: m.me ? `${C.warm}1c` : C.surface,
              border: `1px solid ${m.me ? `${C.warm}3a` : C.line}`,
              borderRadius: m.me ? "26px 26px 8px 26px" : "26px 26px 26px 8px",
              padding: "24px 30px",
              fontFamily: SANS,
              fontSize: 28,
              lineHeight: 1.45,
              color: C.ink,
            }}
          >
            {!m.me && (
              <div style={{ fontSize: 19, color: C.plum, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>
                You
              </div>
            )}
            {m.me && (
              <div style={{ fontSize: 19, color: C.warm, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>
                Sahay
              </div>
            )}
            {m.text}
          </div>
        </Reveal>
      ))}
    </div>
  </>
);

const AnswerScene: React.FC<{ s: PrimerSceneData }> = ({ s }) => (
  <>
    {s.eyebrow && <Eyebrow text={s.eyebrow} accent={C.green} />}
    <KineticTitle text={s.title ?? ""} size={74} />
    {s.subtitle && <Subtitle text={s.subtitle} delay={28} max={1100} />}
    <Reveal delay={38} y={26} scaleFrom={0.96} style={{ width: "100%", maxWidth: 1080, marginTop: 46 }}>
      <div style={{ ...cardStyle, padding: 38 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <IconBadge name="spark" accent={C.green} size={42} />
          <span style={{ fontFamily: SANS, fontSize: 22, fontWeight: 600, color: C.green, letterSpacing: 0.5 }}>
            Library assistant
          </span>
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1.4, color: C.ink }}>{s.answer}</div>
        <div style={{ display: "flex", gap: 14, marginTop: 26, flexWrap: "wrap" }}>
          {["Sensate focus — Masters & Johnson", "CBT for sexual concerns"].map((cite, i) => (
            <Reveal key={i} delay={60 + i * 8} y={12} scaleFrom={0.9}>
              <div
                style={{
                  background: `${C.green}16`,
                  border: `1px solid ${C.green}3a`,
                  borderRadius: 999,
                  padding: "10px 20px",
                  fontFamily: SANS,
                  fontSize: 20,
                  color: C.teal,
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                }}
              >
                <Icon name="check" color={C.green} size={17} />
                {cite}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Reveal>
  </>
);

const AssessScene: React.FC<{ s: PrimerSceneData }> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = interpolate(frame, [44, 44 + fps * 2.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pts = [12, 30, 24, 48, 40, 66, 58, 80];
  const w = 1000;
  const h = 230;
  const stepX = w / (pts.length - 1);
  const d = pts
    .map((v, i) => `${i === 0 ? "M" : "L"} ${i * stepX} ${h - (v / 100) * h}`)
    .join(" ");
  return (
    <>
      {s.eyebrow && <Eyebrow text={s.eyebrow} accent={C.teal} />}
      <KineticTitle text={s.title ?? ""} size={74} />
      {s.subtitle && <Subtitle text={s.subtitle} delay={28} max={1120} />}
      <Reveal delay={38} y={26} scaleFrom={0.97} style={{ width: "100%", maxWidth: 1080, marginTop: 44 }}>
        <div style={{ ...cardStyle, padding: 40 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <span style={{ fontFamily: SANS, fontSize: 24, fontWeight: 600, color: C.ink }}>Your reflection over time</span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                background: `${C.teal}16`,
                border: `1px solid ${C.teal}3a`,
                borderRadius: 999,
                padding: "9px 18px",
                fontFamily: SANS,
                fontSize: 19,
                color: C.teal,
              }}
            >
              <Icon name="lock" color={C.teal} size={17} /> Private · on your device
            </span>
          </div>
          <svg width="100%" viewBox={`0 0 ${w} ${h + 10}`}>
            <path d={d} fill="none" stroke={C.line} strokeWidth={2} />
            <path
              d={d}
              fill="none"
              stroke={C.warm}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - draw}
            />
            {pts.map((v, i) => {
              const cx = i * stepX;
              const cy = h - (v / 100) * h;
              const appear = interpolate(draw, [i / pts.length, i / pts.length + 0.05], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return <circle key={i} cx={cx} cy={cy} r={7 * appear} fill={C.warm} />;
            })}
          </svg>
        </div>
      </Reveal>
    </>
  );
};

const MythScene: React.FC<{ s: PrimerSceneData }> = ({ s }) => {
  const { fps } = useVideoConfig();
  const factDelay = Math.round(s.seconds * fps * 0.42);
  return (
    <>
      {s.eyebrow && <Eyebrow text={s.eyebrow} accent={C.plum} />}
      <KineticTitle text={s.title ?? ""} size={74} />
      {s.subtitle && <Subtitle text={s.subtitle} delay={28} max={1100} />}
      <div style={{ width: "100%", maxWidth: 1040, marginTop: 44, display: "flex", flexDirection: "column", gap: 22 }}>
        <Reveal delay={38} y={22} scaleFrom={0.96}>
          <div style={{ ...cardStyle, borderColor: `${C.warm}55`, padding: "30px 36px", display: "flex", alignItems: "center", gap: 20 }}>
            <span style={{ fontFamily: SANS, fontSize: 19, fontWeight: 700, color: C.warm, letterSpacing: 1, textTransform: "uppercase" }}>Myth</span>
            <span style={{ fontFamily: SERIF, fontSize: 31, color: C.inkSoft, fontStyle: "italic" }}>{s.mythText}</span>
          </div>
        </Reveal>
        <Reveal delay={factDelay} y={26} scaleFrom={0.94}>
          <div style={{ ...cardStyle, borderColor: `${C.teal}55`, background: `${C.teal}10`, padding: "30px 36px", display: "flex", alignItems: "center", gap: 20 }}>
            <span style={{ fontFamily: SANS, fontSize: 19, fontWeight: 700, color: C.teal, letterSpacing: 1, textTransform: "uppercase" }}>Fact</span>
            <span style={{ fontFamily: SERIF, fontSize: 33, color: C.ink, fontWeight: 600 }}>{s.factText}</span>
          </div>
        </Reveal>
      </div>
    </>
  );
};

const ListScene: React.FC<{ s: PrimerSceneData }> = ({ s }) => (
  <>
    {s.eyebrow && <Eyebrow text={s.eyebrow} accent={C.green} />}
    <KineticTitle text={s.title ?? ""} size={72} />
    <div style={{ width: "100%", maxWidth: 1100, marginTop: 40, display: "flex", flexDirection: "column", gap: 20 }}>
      {(s.items ?? []).map((it, i) => (
        <Reveal key={i} delay={26 + i * 12} y={20}>
          <div style={{ ...cardStyle, padding: "26px 32px", display: "flex", alignItems: "flex-start", gap: 20 }}>
            <div style={{ marginTop: 2 }}>
              <IconBadge name="check" accent={C.green} size={46} />
            </div>
            <span style={{ fontFamily: SANS, fontSize: 27, lineHeight: 1.45, color: C.ink }}>{it}</span>
          </div>
        </Reveal>
      ))}
    </div>
  </>
);

const CloseScene: React.FC<{ s: PrimerSceneData }> = ({ s }) => {
  const frame = useCurrentFrame();
  const glow = 0.5 + 0.5 * Math.sin((frame / 70) * Math.PI * 2);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <div
        style={{
          position: "absolute",
          width: 760,
          height: 760,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.warm}33, transparent 65%)`,
          filter: "blur(60px)",
          opacity: 0.6 + glow * 0.3,
        }}
      />
      <KineticTitle text={s.title ?? ""} size={92} base={6} />
      {s.subtitle && <Subtitle text={s.subtitle} delay={26} max={980} />}
      <Reveal delay={42} y={20} scaleFrom={0.9} style={{ marginTop: 50 }}>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 40,
            fontWeight: 700,
            background: `linear-gradient(100deg, ${C.plum}, ${C.warm} 55%, ${C.teal})`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {s.wordmark}
        </div>
      </Reveal>
      {s.domain && (
        <Reveal delay={52} y={14}>
          <div
            style={{
              marginTop: 18,
              fontFamily: SANS,
              fontSize: 24,
              color: C.inkSoft,
              border: `1px solid ${C.line}`,
              borderRadius: 999,
              padding: "12px 26px",
              background: C.surface,
            }}
          >
            {s.domain}
          </div>
        </Reveal>
      )}
    </div>
  );
};

const SCENE_COMPONENTS: Record<string, React.FC<{ s: PrimerSceneData }>> = {
  hero: HeroScene,
  pills: PillsScene,
  cards: CardsScene,
  search: SearchScene,
  chat: ChatScene,
  answer: AnswerScene,
  assess: AssessScene,
  myth: MythScene,
  list: ListScene,
  close: CloseScene,
};

/* ------------------------------------------------------- ambient backdrop */

const Orb: React.FC<{ cx: number; cy: number; r: number; color: string; period: number; amp: number }> = ({
  cx,
  cy,
  r,
  color,
  period,
  amp,
}) => {
  const frame = useCurrentFrame();
  const dx = Math.sin((frame / period) * Math.PI * 2) * amp;
  const dy = Math.cos((frame / (period * 1.3)) * Math.PI * 2) * amp * 0.7;
  return (
    <div
      style={{
        position: "absolute",
        left: cx - r,
        top: cy - r,
        width: r * 2,
        height: r * 2,
        borderRadius: "50%",
        background: `radial-gradient(circle at 38% 38%, ${color}, transparent 68%)`,
        filter: "blur(90px)",
        transform: `translate(${dx}px, ${dy}px)`,
      }}
    />
  );
};

const Particles: React.FC = () => {
  const frame = useCurrentFrame();
  const seeds = React.useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        x: (i * 127) % 1920,
        baseY: (i * 313) % 1080,
        r: 2 + ((i * 7) % 4),
        speed: 8 + ((i * 5) % 10),
        drift: 30 + ((i * 11) % 50),
        phase: (i * 0.7) % (Math.PI * 2),
        op: 0.06 + ((i % 4) * 0.03),
      })),
    [],
  );
  return (
    <AbsoluteFill>
      {seeds.map((s, i) => {
        const y = (s.baseY - (frame * s.speed) / 30) % 1140;
        const yy = y < -20 ? y + 1140 : y;
        const x = s.x + Math.sin(frame / 60 + s.phase) * s.drift;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: yy,
              width: s.r * 2,
              height: s.r * 2,
              borderRadius: "50%",
              background: C.ink,
              opacity: s.op,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const breathe = 1 + 0.015 * Math.sin((frame / 220) * Math.PI * 2);
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${breathe})` }}>
        <Orb cx={420} cy={300} r={460} color={`${C.warm}55`} period={520} amp={70} />
        <Orb cx={1560} cy={760} r={520} color={`${C.plum}4d`} period={620} amp={80} />
        <Orb cx={980} cy={1040} r={440} color={`${C.teal}4d`} period={700} amp={60} />
        <Orb cx={1620} cy={180} r={360} color={`${C.green}40`} period={580} amp={55} />
      </AbsoluteFill>
      <Particles />
      <AbsoluteFill
        style={{
          background: "radial-gradient(120% 120% at 50% 45%, transparent 55%, rgba(28,20,15,0.10) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

const Watermark: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: 56,
      bottom: 44,
      display: "flex",
      alignItems: "center",
      gap: 12,
      opacity: 0.5,
    }}
  >
    <span
      style={{
        width: 30,
        height: 30,
        borderRadius: 9,
        background: `linear-gradient(120deg, ${C.plum}, ${C.warm} 60%, ${C.teal})`,
      }}
    />
    <span style={{ fontFamily: SANS, fontSize: 20, color: C.inkSoft, fontWeight: 500 }}>
      Intimacy & Sex Therapy Library
    </span>
  </div>
);

/* ------------------------------------------------------------------- root */

export const Primer: React.FC<PrimerProps> = ({ scenes }) => {
  const { fps } = useVideoConfig();
  let cursor = 0;
  const ranges = scenes.map((s) => {
    const dur = Math.max(1, Math.round(s.seconds * fps));
    const r = { from: cursor, durationInFrames: dur };
    cursor += dur;
    return r;
  });
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <Backdrop />
      {scenes.map((s, i) => {
        const Comp = SCENE_COMPONENTS[s.kind] ?? HeroScene;
        return (
          <Sequence key={s.id} from={ranges[i].from} durationInFrames={ranges[i].durationInFrames}>
            <SceneFrame durationInFrames={ranges[i].durationInFrames}>
              <Comp s={s} />
            </SceneFrame>
          </Sequence>
        );
      })}
      <Watermark />
    </AbsoluteFill>
  );
};
