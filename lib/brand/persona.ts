/**
 * Single source of truth for the on-camera narrator persona.
 *
 * Anchor reference: "a trusted late-night radio host who happens to
 * be beautiful." Warm, bold, confident, attractive but clinical. NOT
 * seductive (that was an explicit brand + platform-safety decision —
 * see RUNBOOK-CONTENT-ENGINE.md and Meta/YouTube moderation notes).
 *
 * Consumers:
 *   - lib/social/tts.ts                — voice id, pace
 *   - lib/social/tts-edge.ts           — Edge neural voice default
 *   - lib/social/avatar.ts             — portrait path passed to
 *                                        Replicate's talking-head model
 *   - video-factory/AvatarReel.tsx     — copy/visual cues
 *   - lib/social/script-generator.ts   — voice-direction snippet for
 *                                        the LLM prompt, so scripts
 *                                        are written FOR this voice
 *
 * Anything brand-facing that wants to know "what's the host like?"
 * should import from here and not duplicate the brief.
 */

import { join } from "node:path";

export type Persona = {
  /** Reproducibility — the static portrait used for talking-head renders. */
  portraitPath: string;
  /** Public URL of the portrait once committed under /public. */
  portraitPublicUrl: string;

  /** One-line elevator description for use in LLM system prompts etc. */
  brief: string;

  /** Multi-line voice direction injected into the script-generator prompt. */
  voiceDirection: string;

  /** TTS settings. */
  tts: {
    /**
     * Microsoft Edge neural voice id for English. en-US-AvaNeural is a
     * newer expressive voice tuned for podcast-style delivery, slightly
     * warmer than the older Aria/Jenny voices the project defaulted to.
     */
    edgeEnglishVoice: string;
    /** Indian English fallback. */
    edgeIndianEnglishVoice: string;
    /** Hindi voice when the script locale is hi/hinglish. */
    edgeHindiVoice: string;
    /**
     * ElevenLabs voice id used when ELEVENLABS_API_KEY is set AND we
     * want premium warmth. Rachel (21m00Tcm4TlvDq8ikWAM) is grounded,
     * late-30s timbre — closer to the radio-host reference than Bella.
     */
    elevenLabsVoiceId: string;
    /**
     * Words-per-minute target. Slightly slower than typical podcast
     * pace (~150 vs the 170-180 average) so the delivery reads as
     * unhurried + authoritative rather than rushed.
     */
    targetWpm: number;
  };
};

/**
 * Allow operators to override individual fields via env without forking
 * this module. Useful for A/B testing voices on a side channel.
 */
function envOr<T extends string>(key: string, fallback: T): T {
  const v = process.env[key];
  return (v && v.length > 0 ? v : fallback) as T;
}

export const NARRATOR: Persona = {
  portraitPath: join(process.cwd(), "public", "brand", "narrator.png"),
  portraitPublicUrl: "/brand/narrator.png",

  brief:
    "A trusted late-night radio host who happens to be beautiful. Warm, " +
    "bold, confident; speaks like she's the only one in the room with you " +
    "at 11pm and she knows exactly what she's talking about. Clinical " +
    "underneath the warmth — every claim is sourced.",

  voiceDirection: [
    "Write for a narrator with the energy of a late-night radio host:",
    "- unhurried pace, slightly lower-register, intimate but not whispery",
    "- bold and confident — she states things plainly, never hedges",
    "- warm tone but clinical content; never seductive or coy",
    "- assumes the listener is an intelligent adult who deserves real info",
    "- uses 'you' generously, 'we' occasionally, 'I' rarely",
    "- contractions are fine; jargon only when defined; no clinical hedges",
    "  like 'some say' or 'it is generally understood'",
  ].join("\n"),

  tts: {
    edgeEnglishVoice: envOr("EDGE_TTS_VOICE_EN_NARRATOR", "en-US-AvaNeural"),
    edgeIndianEnglishVoice: envOr(
      "EDGE_TTS_VOICE_EN_IN_NARRATOR",
      "en-IN-NeerjaNeural",
    ),
    edgeHindiVoice: envOr("EDGE_TTS_VOICE_HI_NARRATOR", "hi-IN-SwaraNeural"),
    elevenLabsVoiceId: envOr(
      "ELEVENLABS_VOICE_ID_NARRATOR",
      "21m00Tcm4TlvDq8ikWAM",
    ),
    targetWpm: Number(process.env.NARRATOR_TARGET_WPM ?? "150"),
  },
};
