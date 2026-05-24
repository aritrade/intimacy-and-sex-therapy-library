/**
 * Text-to-speech adapters.
 *
 * Two providers, picked by language:
 *   - Hindi / Hinglish / Indic scripts → Sarvam AI (https://api.sarvam.ai)
 *   - English → ElevenLabs (https://api.elevenlabs.io) [Cartesia is a drop-in
 *     alternative; flip ELEVENLABS_API_URL]
 *
 * Returns a Buffer of MP3 audio. Callers (lib/social/render.ts) write this
 * to disk before passing to Remotion.
 *
 * If the relevant API key is unset, returns null — the render pipeline will
 * fall back to silent audio so the rest of the pipeline still type-checks.
 */

export type TTSLocale = "en" | "hi" | "hinglish";

export type TTSResult = {
  audio: Buffer;
  mime: "audio/mpeg" | "audio/wav";
  durationSeconds: number;
  provider: "sarvam" | "elevenlabs" | "stub";
};

export async function synthesize(
  text: string,
  locale: TTSLocale,
): Promise<TTSResult | null> {
  if (locale === "en") return synthesizeEnglish(text);
  return synthesizeIndic(text, locale);
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
