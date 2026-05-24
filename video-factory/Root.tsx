import { Composition } from "remotion";
import { ShortFormVideo, type ShortFormProps } from "./ShortFormVideo";

const FPS = 30;

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

/**
 * Remotion entry. The render CLI (lib/social/render.ts) constructs the bundle
 * from this file and overrides `defaultProps` per draft.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
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
    </>
  );
};
