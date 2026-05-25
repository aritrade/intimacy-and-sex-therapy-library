/**
 * Text-to-speech adapters.
 *
 * Provider selection (in order, first one that works wins):
 *   1. Microsoft Edge TTS — free, no key, neural voices for en-US,
 *      en-IN, hi-IN. Default for every locale.
 *   2. Sarvam AI — paid Hindi / Indic TTS. Used only for hi/hinglish
 *      when SARVAM_API_KEY is set AND TTS_PROVIDER=sarvam.
 *   3. ElevenLabs — paid English TTS. Used only when ELEVENLABS_API_KEY
 *      is set AND TTS_PROVIDER=elevenlabs.
 *
 * Override the default by setting `TTS_PROVIDER` to `edge | sarvam |
 * elevenlabs` in env. Default is `edge` (free).
 *
 * Returns a Buffer of audio bytes. Callers (lib/social/render.ts) write
 * this to disk before passing to Remotion.
 *
 * If every adapter fails or returns null, the render pipeline falls back
 * to a silent track so the rest of the pipeline still type-checks.
 */

import { synthesizeEdgeTTS } from "./tts-edge";

export type TTSLocale = "en" | "hi" | "hinglish";

export type TTSResult = {
  audio: Buffer;
  mime: "audio/mpeg" | "audio/wav";
  durationSeconds: number;
  provider: "edge" | "sarvam" | "elevenlabs" | "stub";
};

export async function synthesize(
  text: string,
  locale: TTSLocale,
): Promise<TTSResult | null> {
  const provider = (process.env.TTS_PROVIDER ?? "edge").toLowerCase();

  if (provider === "edge") {
    try {
      const r = await synthesizeEdgeTTS(text, locale);
      if (r) return r;
    } catch (e) {
      console.warn("[tts] Edge TTS failed, falling back:", (e as Error).message);
    }
    // Edge failed — try paid providers as fallback if configured.
    if (locale === "en" && process.env.ELEVENLABS_API_KEY) {
      return synthesizeEnglish(text);
    }
    if ((locale === "hi" || locale === "hinglish") && process.env.SARVAM_API_KEY) {
      return synthesizeIndic(text, locale);
    }
    return null;
  }

  if (provider === "sarvam") return synthesizeIndic(text, locale);
  if (provider === "elevenlabs") return synthesizeEnglish(text);

  // Unknown provider, default to free.
  return synthesizeEdgeTTS(text, locale);
}

async function synthesizeIndic(text: string, locale: TTSLocale): Promise<TTSResult | null> {
  const key = process.env.SARVAM_API_KEY;
  if (!key) return null;

  // Sarvam exposes /text-to-speech with a JSON body and returns base64 audio.
  // We pick the bulbul:v1 voice as a reasonable default; operators can override
  // via SARVAM_VOICE.
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: {
      "api-subscription-key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: [text],
      target_language_code: "hi-IN",
      speaker: process.env.SARVAM_VOICE ?? "meera",
      pitch: 0,
      pace: 1.0,
      loudness: 1.0,
      speech_sample_rate: 22050,
      enable_preprocessing: true,
      model: "bulbul:v1",
    }),
  });
  if (!res.ok) {
    throw new Error(`Sarvam TTS ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { audios?: string[] };
  const b64 = data.audios?.[0];
  if (!b64) throw new Error("Sarvam TTS returned no audio");
  const audio = Buffer.from(b64, "base64");
  return {
    audio,
    mime: "audio/wav",
    durationSeconds: estimateDuration(text, locale),
    provider: "sarvam",
  };
}

async function synthesizeEnglish(text: string): Promise<TTSResult | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;

  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL"; // Bella, ElevenLabs free voice
  const url = `${process.env.ELEVENLABS_API_URL ?? "https://api.elevenlabs.io"}/v1/text-to-speech/${voiceId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.2 },
    }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs TTS ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const audio = Buffer.from(await res.arrayBuffer());
  return {
    audio,
    mime: "audio/mpeg",
    durationSeconds: estimateDuration(text, "en"),
    provider: "elevenlabs",
  };
}

/** Rough duration estimate in seconds when the provider doesn't report one. */
function estimateDuration(text: string, locale: TTSLocale): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  // English ~150wpm; Hindi/Hinglish a touch slower in TTS practice
  const wpm = locale === "en" ? 150 : 130;
  return Math.max(2, (words / wpm) * 60);
}
