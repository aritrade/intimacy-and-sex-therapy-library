import { Composition } from "remotion";
import { ShortFormVideo, type ShortFormProps } from "./ShortFormVideo";
import { StockReel, type StockReelProps } from "./StockReel";
import { AvatarReel, type AvatarReelProps } from "./AvatarReel";
import { PhotoReel, type PhotoReelProps } from "./PhotoReel";
import { LongFormEssay, type LongFormEssayProps } from "./LongFormEssay";
import { QuoteCarousel, type QuoteCarouselProps } from "./QuoteCarousel";
import { Primer, type PrimerProps, type PrimerSceneData } from "./Primer";
import primerScript from "../marketing/primer/script.json";

const FPS = 30;

// The homepage primer. Content lives in marketing/primer/script.json (the same
// file the narration builder reads). Per-scene `seconds` are placeholders here
// for studio preview; scripts/render-primer.ts overrides them from
// marketing/primer/timings.json so the cut lands exactly on the voiceover.
const primerScenes: PrimerSceneData[] = (primerScript.scenes as Omit<PrimerSceneData, "seconds">[]).map(
  (s, i) => ({ ...s, seconds: i === primerScript.scenes.length - 1 ? 15 : 17 }),
);
const samplePrimer: PrimerProps = {
  scenes: primerScenes,
  totalSeconds: primerScenes.reduce((acc, s) => acc + s.seconds, 0),
};

const sample: ShortFormProps = {
  hook: "A reminder, not a remedy:",
  scenes: [
    { text: "Desire is rarely a switch.", seconds: 3 },
    { text: "For most people, it builds — through context, safety, and pleasure.", seconds: 5 },
    { text: "If yours has thinned out, the brake might be louder than the accelerator.", seconds: 6 },
    { text: "What's one brake you could ease this week?", seconds: 4 },
  ],
  cta: "Open the Sexless-marriage path on the library.",
  citationLine: "Source: Bancroft & Janssen — dual-control model of sexual response.",
  language: "en",
  voiceoverUrl: null,
  totalSeconds: 18,
};

const sampleStock: StockReelProps = {
  ...sample,
  scenes: sample.scenes.map((s) => ({ ...s, clips: [] })),
};

const sampleAvatar: AvatarReelProps = {
  ...sample,
  scenes: sample.scenes.map((s) => ({ ...s, clips: [] })),
  avatarUrl: null,
  portraitUrl: null,
  voiceoverUrl: null,
};

const samplePhoto: PhotoReelProps = {
  ...sample,
  scenes: sample.scenes.map((s) => ({ ...s, photos: [] })),
  portraitUrl: null,
  voiceoverUrl: null,
};

const sampleLong: LongFormEssayProps = {
  ...sample,
  totalSeconds: 240,
  scenes: sample.scenes.map((s) => ({
    title: "Chapter",
    text: s.text,
    seconds: s.seconds * 12,
    clips: [],
  })),
};

const sampleCarousel: QuoteCarouselProps = {
  hook: sample.hook,
  scenes: sample.scenes.map((s) => ({ text: s.text, attribution: null })),
  cta: sample.cta,
  citationLine: sample.citationLine,
  language: sample.language,
  voiceoverUrl: null,
  totalSeconds: 6,
};

/**
 * Remotion entry. The render CLI (lib/social/render.ts) constructs the bundle
 * from this file and overrides `defaultProps` per draft.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 9:16 typography reel — the original, mood-only template. */}
      <Composition
        id="ShortFormVideo"
        component={ShortFormVideo}
        durationInFrames={Math.ceil(sample.totalSeconds * FPS)}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={sample}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil(props.totalSeconds * FPS),
        })}
      />

      {/* 9:16 stock-footage reel — captions over Pexels/Pixabay clips. */}
      <Composition
        id="StockReel"
        component={StockReel}
        durationInFrames={Math.ceil(sampleStock.totalSeconds * FPS)}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={sampleStock}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil(props.totalSeconds * FPS),
        })}
      />

      {/* 9:16 avatar reel — persona talking-head with kinetic typography
          + B-roll cutaways. The marquee composition once the avatar
          pipeline is wired in. */}
      <Composition
        id="AvatarReel"
        component={AvatarReel}
        durationInFrames={Math.ceil(sampleAvatar.totalSeconds * FPS)}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={sampleAvatar}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil(props.totalSeconds * FPS),
        })}
      />

      {/* 9:16 photo reel — narrator voiceover over a Ken-Burns sequence
          of stock photos with kinetic captions. The V1 default — works
          without any paid AI compute and renders fast. */}
      <Composition
        id="PhotoReel"
        component={PhotoReel}
        durationInFrames={Math.ceil(samplePhoto.totalSeconds * FPS)}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={samplePhoto}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil(props.totalSeconds * FPS),
        })}
      />

      {/* 16:9 long-form essay — for YouTube. */}
      <Composition
        id="LongFormEssay"
        component={LongFormEssay}
        durationInFrames={Math.ceil(sampleLong.totalSeconds * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={sampleLong}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil(props.totalSeconds * FPS),
        })}
      />

      {/* 16:9 homepage primer — the cinematic "Watch a 5-minute primer"
          film. Light brand palette, motion-design walkthrough. Rendered
          silent then muxed with narration by scripts/render-primer.ts. */}
      <Composition
        id="Primer"
        component={Primer}
        durationInFrames={Math.ceil(samplePrimer.totalSeconds * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={samplePrimer}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil(
            props.scenes.reduce((acc, s) => acc + s.seconds, 0) * FPS,
          ),
        })}
      />

      {/* 1080x1080 carousel — render slides as PNG stills. */}
      <Composition
        id="QuoteCarousel"
        component={QuoteCarousel}
        durationInFrames={Math.ceil(sampleCarousel.totalSeconds * FPS)}
        fps={FPS}
        width={1080}
        height={1080}
        defaultProps={sampleCarousel}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil((props.scenes.length + 2) * FPS),
        })}
      />
    </>
  );
};
