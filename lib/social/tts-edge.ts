/**
 * Microsoft Edge TTS — completely free, no API key, no rate limit we
 * realistically hit at our cadence. Backed by the same neural voices
 * that power the Edge "Read Aloud" feature.
 *
 * Voices we expose:
 *   - en-US-AriaNeural / en-US-JennyNeural (warm, conversational)
 *   - en-IN-NeerjaNeural / en-IN-PrabhatNeural (Indian English)
 *   - hi-IN-SwaraNeural / hi-IN-MadhurNeural (Hindi)
 *
 * We pick a default per locale; operators can override via
 * EDGE_TTS_VOICE_<LOCALE> env vars when they want a specific voice for
 * the channel's brand.
 *
 * Returns MP3 buffer (Edge TTS natively returns audio-24khz-48kbitrate
 * MP3 frames; we concatenate them).
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { TTSResult, TTSLocale } from "./tts";
import { NARRATOR } from "../brand/persona";

// English defaults to the narrator persona's voice (currently
// en-US-AvaNeural — slightly slower, warmer, podcast-style delivery).
// Hindi/Hinglish keep Indic voices because en-US would be jarring.
// Operators can still pin a specific voice via EDGE_TTS_VOICE_<LOCALE>.
const DEFAULT_VOICES: Record<TTSLocale, string> = {
  en: process.env.EDGE_TTS_VOICE_EN ?? NARRATOR.tts.edgeEnglishVoice,
  hi: process.env.EDGE_TTS_VOICE_HI ?? NARRATOR.tts.edgeHindiVoice,
  hinglish:
    process.env.EDGE_TTS_VOICE_HINGLISH ?? NARRATOR.tts.edgeIndianEnglishVoice,
};

export async function synthesizeEdgeTTS(
  text: string,
  locale: TTSLocale,
): Promise<TTSResult | null> {
  const voice = DEFAULT_VOICES[locale];
  if (!voice) return null;

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  // The library emits a stream; we concat into a single Buffer.
  const stream = tts.toStream(text);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.audioStream.on("end", resolve);
    stream.audioStream.on("close", resolve);
    stream.audioStream.on("error", reject);
    // Hard timeout — Edge's WebSocket can hang on rare bad chars.
    setTimeout(() => reject(new Error("Edge TTS stream timeout")), 30_000);
  });

  if (chunks.length === 0) return null;
  const audio = Buffer.concat(chunks);

  return {
    audio,
    mime: "audio/mpeg",
    durationSeconds: estimateDuration(text, locale),
    provider: "edge",
  };
}

function estimateDuration(text: string, locale: TTSLocale): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  // Edge neural voices tend to be ~145wpm English, ~115wpm Hindi.
  const wpm = locale === "en" ? 145 : 115;
  return Math.max(2, (words / wpm) * 60);
}
