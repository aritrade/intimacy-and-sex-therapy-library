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
     * Microsoft Edge neural voice id for English. en-US-JennyNeural is the
     * "warm friendly Cortana" voice — older generation but trained for
     * conversational delivery, so at -10% rate it holds together far better
     * than the late-2024 Multilingual voices (Emma/Ava/Cora), which were
     * trained on tighter narration data and stretch into a robotic register
     * past -8%. Picked over Emma/Ava in the 2026-05-26 A/B (see
     * canvases/voice-picker.canvas.tsx). Override via
     * EDGE_TTS_VOICE_EN_NARRATOR if you want to A/B another voice.
     */
    edgeEnglishVoice: string;
    /**
     * Indian English voice used when the script locale is `hinglish`
     * (English with transliterated Hindi words). Brand decision (2026-05-26):
     * we use ONE narrator voice across every locale that's mostly English,
     * so this defaults to the same en-US-JennyNeural as edgeEnglishVoice
     * for brand consistency. The trade-off is that the few transliterated
     * Hindi words ("pyaar", "ishq", etc.) get pronounced with American
     * phonemes rather than Indian; that's acceptable given the volume
     * (one or two words per reel) and the consistency win is bigger.
     * Override via EDGE_TTS_VOICE_EN_IN_NARRATOR if you ever want to
     * route hinglish to a true Indian-English voice like en-IN-NeerjaNeural
     * (more authentic on transliterated Hindi, less consistent brand).
     */
    edgeIndianEnglishVoice: string;
    /** Hindi voice when the script locale is pure `hi`. */
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
    /**
     * Edge/Azure SSML prosody settings. Applied to the whole voiceover.
     * Tuned for a "pro trainer / late-night radio host" character:
     *   - rate slightly under default so each idea has room to land
     *   - pitch a touch lower for grounded confidence (more than -3st
     *     starts to sound robotic on Edge neural voices)
     *   - volume left at default
     */
    prosody: {
      rate: string;
      pitch: string;
      volume?: string;
    };
    /**
     * Inline SSML <break time="..."/> durations the script-to-SSML
     * builder injects at structural boundaries. Tuned for a "let it
     * land" trainer cadence — viewers process each idea before the
     * next one starts.
     */
    pauses: {
      /** After hook → first body scene, and last body scene → CTA. */
      transitionMs: number;
      /** Between adjacent body scenes. */
      sceneMs: number;
      /** After every sentence period inside a scene. */
      sentenceMs: number;
      /** After commas / em-dashes / semicolons inside a sentence. */
      clauseMs: number;
      /**
       * Silence appended AFTER the final CTA segment. Acts as a
       * "trailing breathing room" buffer so the last spoken word can't
       * be clipped by player edge-cases (Instagram, YouTube Shorts,
       * and some browsers truncate the final 100–300ms of a track).
       */
      tailMs: number;
    };
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
    edgeEnglishVoice: envOr(
      "EDGE_TTS_VOICE_EN_NARRATOR",
      "en-US-JennyNeural",
    ),
    edgeIndianEnglishVoice: envOr(
      "EDGE_TTS_VOICE_EN_IN_NARRATOR",
      "en-US-JennyNeural",
    ),
    edgeHindiVoice: envOr("EDGE_TTS_VOICE_HI_NARRATOR", "hi-IN-SwaraNeural"),
    elevenLabsVoiceId: envOr(
      "ELEVENLABS_VOICE_ID_NARRATOR",
      "21m00Tcm4TlvDq8ikWAM",
    ),
    targetWpm: Number(process.env.NARRATOR_TARGET_WPM ?? "120"),
    prosody: {
      // Jenny (older Cortana generation) holds together at -10% rate but
      // starts to mush past -12%. -1st pitch keeps her in her natural
      // warm register; deeper than that pushes into uncanny territory on
      // this voice family. Both tuned in the 2026-05-26 voice A/B.
      rate: envOr("NARRATOR_PROSODY_RATE", "-10%"),
      pitch: envOr("NARRATOR_PROSODY_PITCH", "-1st"),
      volume: process.env.NARRATOR_PROSODY_VOLUME || undefined,
    },
    pauses: {
      // Long-form "explainer / trainer" cadence — viewers get a beat to
      // absorb the previous idea before the next one starts. tailMs is
      // applied AFTER the CTA segment so the last spoken word never
      // gets clipped by player edge-cases (some platforms truncate the
      // final 100–300ms of a track).
      transitionMs: Number(process.env.NARRATOR_PAUSE_TRANSITION_MS ?? "650"),
      sceneMs: Number(process.env.NARRATOR_PAUSE_SCENE_MS ?? "750"),
      sentenceMs: Number(process.env.NARRATOR_PAUSE_SENTENCE_MS ?? "350"),
      clauseMs: Number(process.env.NARRATOR_PAUSE_CLAUSE_MS ?? "180"),
      tailMs: Number(process.env.NARRATOR_PAUSE_TAIL_MS ?? "700"),
    },
  },
};
