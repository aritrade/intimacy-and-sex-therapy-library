/**
 * Microsoft Edge TTS — completely free, no API key, no rate limit we
 * realistically hit at our cadence. Backed by the same neural voices
 * that power the Edge "Read Aloud" feature.
 *
 * English default is en-US-EmmaMultilingualNeural — Edge's late-2024
 * generation with substantially more natural prosody than the older
 * Neural voices. Operators can override via EDGE_TTS_VOICE_<LOCALE>.
 *
 * IMPORTANT: pass PLAIN TEXT only. Edge's free Read Aloud WSS endpoint
 * rejects every pause SSML element (<break>, <mstts:silence>, even
 * outside <prosody>) — it silently returns zero bytes. For inter-segment
 * pauses, the orchestrator in lib/social/tts.ts calls this function
 * per segment and stitches the resulting MP3s with ffmpeg-generated
 * silence between them.
 *
 * Returns MP3 buffer (Edge TTS natively returns audio-24khz-48kbitrate
 * MP3 frames; we concatenate them).
 */

import { MsEdgeTTS, OUTPUT_FORMAT, ProsodyOptions } from "msedge-tts";
import type { TTSResult, TTSLocale } from "./tts";
import { NARRATOR } from "../brand/persona";

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

  // Apply persona prosody (rate / pitch / optional volume). These get
  // baked into the library's default <prosody> wrapper, so inline
  // <break> tags in `text` remain valid SSML inside the wrapper.
  const prosody: ProsodyOptions = {
    rate: NARRATOR.tts.prosody.rate,
    pitch: NARRATOR.tts.prosody.pitch,
    ...(NARRATOR.tts.prosody.volume
      ? { volume: NARRATOR.tts.prosody.volume }
      : {}),
  };

  // The library emits a stream; we concat into a single Buffer.
  const stream = tts.toStream(text, prosody);
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
  const baseWpm =
    locale === "en" ? NARRATOR.tts.targetWpm : NARRATOR.tts.targetWpm * 0.85;
  return Math.max(2, (words / baseWpm) * 60);
}
