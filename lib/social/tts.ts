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

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { synthesizeEdgeTTS } from "./tts-edge";
import { NARRATOR } from "../brand/persona";
import {
  speechPlanToElevenLabsText,
  speechPlanToPlainText,
  type SpeechSegment,
} from "./speech-plan";

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

/**
 * Segmented synthesis — synthesise each {@link SpeechSegment} as a
 * separate TTS request and stitch them back together with ffmpeg-
 * generated silence between segments.
 *
 * This is the production path for the content engine. We use it
 * because Edge TTS's free WSS endpoint rejects every pause SSML
 * element, so inter-scene pauses can't be expressed inline. Per-segment
 * synthesis + ffmpeg silence gives us byte-level control over pause
 * length while keeping Edge's natural intra-sentence prosody.
 *
 * Provider-specific dispatch:
 *   - edge / default : per-segment Edge call, ffmpeg concat with silence
 *   - elevenlabs     : single ElevenLabs call with inline <break> tags
 *                      (ElevenLabs honours <break> natively, and one
 *                      call is cheaper than N + glue work)
 *   - sarvam         : per-segment Sarvam call, ffmpeg concat with
 *                      silence (Sarvam also lacks SSML support)
 *
 * Returns null when every adapter is unavailable; callers should fall
 * back to a silent render.
 */
export async function synthesizeSegmented(
  segments: SpeechSegment[],
  locale: TTSLocale,
): Promise<TTSResult | null> {
  if (segments.length === 0) return null;
  const provider = (process.env.TTS_PROVIDER ?? "edge").toLowerCase();

  // ElevenLabs handles inline <break> natively — collapse and send once.
  // The English fallback path also takes this branch when Edge fails
  // and the operator has ElevenLabs configured (handled by `synthesize`).
  if (provider === "elevenlabs" && locale === "en") {
    return synthesizeEnglish(speechPlanToElevenLabsText(segments));
  }

  // Per-segment synthesis path (Edge + Sarvam).
  const perSegment = async (s: SpeechSegment): Promise<TTSResult | null> => {
    if (provider === "sarvam" || (locale !== "en" && provider === "edge")) {
      // For Indic locales, Edge has voices but Sarvam is preferred when
      // available; fall back to Edge otherwise.
      if (process.env.SARVAM_API_KEY && (locale === "hi" || locale === "hinglish")) {
        return synthesizeIndic(s.text, locale);
      }
    }
    // Edge default.
    try {
      const r = await synthesizeEdgeTTS(s.text, locale);
      if (r) return r;
    } catch (e) {
      console.warn(
        "[tts] segment Edge failed, falling back:",
        (e as Error).message,
      );
    }
    if (locale === "en" && process.env.ELEVENLABS_API_KEY) {
      return synthesizeEnglish(s.text);
    }
    return null;
  };

  // Parallel synthesis cuts wall time noticeably for 5-7 segments (each
  // Edge call carries 1-2s of WebSocket overhead). The ordering is
  // preserved by the array index, so the final concat is deterministic.
  const audios = await Promise.all(segments.map(perSegment));
  if (audios.some((a) => !a)) {
    console.warn("[tts] one or more segments returned null; aborting");
    return null;
  }

  // All segments synthesised successfully — stitch them with silence.
  const mp3Buffers = (audios as TTSResult[]).map((a) => a.audio);
  const provider0 = (audios[0] as TTSResult).provider;
  const stitchResult = await stitchWithSilence(
    mp3Buffers,
    segments.map((s) => s.silenceMsAfter),
  );
  if (!stitchResult) return null;

  // Use the ffmpeg-probed duration of the stitched MP3, not the sum of
  // per-segment estimates. Edge TTS rate=-8% produces audio noticeably
  // slower than our targetWpm estimate, and Remotion needs the EXACT
  // duration to avoid clipping the voiceover at the end of the video.
  return {
    audio: stitchResult.buffer,
    mime: "audio/mpeg",
    durationSeconds: stitchResult.durationSeconds,
    provider: provider0,
  };
}

/**
 * Stitch a sequence of MP3 buffers together with `silenceMsAfter[i]`
 * milliseconds of silence inserted after each one (except the last,
 * where we trim to 0 regardless). Returns the stitched buffer AND the
 * exact MP3 duration as probed by ffmpeg, so callers can use it as the
 * authoritative track length.
 *
 * Uses ffmpeg's concat demuxer with a generated file list. We write
 * each input MP3 + silence MP3 to a temp dir, then concatenate with
 * re-encoding (libmp3lame@48k mono 24kHz) so every input — including
 * the silence stretches — has matching frame parameters and the
 * concatenation is gap-free.
 */
async function stitchWithSilence(
  audios: Buffer[],
  silenceMsAfter: number[],
): Promise<{ buffer: Buffer; durationSeconds: number } | null> {
  if (audios.length === 0) return null;

  const ffmpegBin = ffmpegStatic;

  if (audios.length === 1) {
    const buf = audios[0];
    const durationSeconds = ffmpegBin
      ? await probeDurationFromBuffer(ffmpegBin, buf).catch(() => 0)
      : 0;
    return { buffer: buf, durationSeconds };
  }

  if (!ffmpegBin) {
    console.warn(
      "[tts] ffmpeg-static is not available — returning first segment only",
    );
    return { buffer: audios[0], durationSeconds: 0 };
  }

  const dir = await mkdtemp(join(tmpdir(), "tts-stitch-"));
  try {
    // Write all speech segments.
    const inputFiles: string[] = [];
    for (let i = 0; i < audios.length; i++) {
      const p = join(dir, `seg-${String(i).padStart(3, "0")}.mp3`);
      await writeFile(p, audios[i]);
      inputFiles.push(p);
    }

    // Generate the distinct silence MP3s needed (dedupe by duration so
    // we don't waste ffmpeg invocations).
    const uniqueSilences = Array.from(
      new Set(silenceMsAfter.filter((ms) => ms > 0)),
    );
    const silenceFileByMs = new Map<number, string>();
    for (const ms of uniqueSilences) {
      const sp = join(dir, `silence-${ms}.mp3`);
      await runFfmpegCapture(ffmpegBin, [
        "-f", "lavfi",
        "-i", `anullsrc=channel_layout=mono:sample_rate=24000`,
        "-t", (ms / 1000).toFixed(3),
        "-c:a", "libmp3lame",
        "-b:a", "48k",
        "-ar", "24000",
        "-ac", "1",
        "-y", sp,
      ]);
      silenceFileByMs.set(ms, sp);
    }

    // Build concat list (one line per file).
    const concatLines: string[] = [];
    for (let i = 0; i < audios.length; i++) {
      concatLines.push(`file '${inputFiles[i].replace(/'/g, "'\\''")}'`);
      const gap = silenceMsAfter[i] ?? 0;
      if (gap > 0 && i < audios.length - 1) {
        const sp = silenceFileByMs.get(gap);
        if (sp) concatLines.push(`file '${sp.replace(/'/g, "'\\''")}'`);
      }
    }
    const listPath = join(dir, "concat-list.txt");
    await writeFile(listPath, concatLines.join("\n"));

    // Concatenate with the concat demuxer. Re-encoding (no -c copy)
    // because Edge MP3 segments have varying bitrates and `copy` blows
    // up if frame headers don't match across files. libmp3lame at 48k
    // matches the silence track exactly, so output remains uniform.
    const outPath = join(dir, "stitched.mp3");
    const ffmpegStderr = await runFfmpegCapture(ffmpegBin, [
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c:a", "libmp3lame",
      "-b:a", "48k",
      "-ar", "24000",
      "-ac", "1",
      "-y", outPath,
    ]);

    const buffer = await readFile(outPath);
    // ffmpeg prints `size=... time=HH:MM:SS.SS bitrate=...` on the
    // final encoded progress line; the LAST such `time=` is the output
    // track length. More reliable than re-probing because no second
    // ffmpeg pass is needed.
    const durationSeconds = parseEncodedTime(ffmpegStderr);
    return { buffer, durationSeconds };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Probe an in-memory MP3 buffer's duration by writing it to a temp
 *  file and running ffmpeg's null muxer. Used only for the
 *  single-segment case (where we don't otherwise touch ffmpeg). */
async function probeDurationFromBuffer(bin: string, buf: Buffer): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), "tts-probe-"));
  try {
    const p = join(dir, "probe.mp3");
    await writeFile(p, buf);
    const stderr = await runFfmpegCapture(bin, [
      "-i", p,
      "-f", "null",
      "-",
    ]);
    return parseEncodedTime(stderr);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function parseEncodedTime(stderr: string): number {
  // Match every `time=HH:MM:SS.SS` and take the last — ffmpeg emits one
  // per progress update and on completion.
  const re = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/g;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr)) !== null) last = m;
  if (!last) return 0;
  const [, hh, mm, ss] = last;
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
}

function runFfmpegCapture(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-2000)}`));
    });
  });
}


async function synthesizeIndic(text: string, locale: TTSLocale): Promise<TTSResult | null> {
  const key = process.env.SARVAM_API_KEY;
  if (!key) return null;

  // Sarvam does NOT understand SSML — it would speak the literal tag
  // names. Use the raw text directly (the segmented synthesis path
  // handles inter-scene pauses; this helper only sees one segment at a
  // time when called via `synthesizeSegmented`).
  const spoken = text;

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
      inputs: [spoken],
      target_language_code: "hi-IN",
      speaker: process.env.SARVAM_VOICE ?? "meera",
      pitch: 0,
      // Sarvam's "pace" is a multiplier; mirror our Edge slowdown.
      pace: 0.92,
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
    durationSeconds: estimateDuration(spoken, locale),
    provider: "sarvam",
  };
}

async function synthesizeEnglish(text: string): Promise<TTSResult | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;

  // Default to the persona's voice (Rachel — grounded, late-30s timbre,
  // matches the "late-night radio host" anchor). Pre-existing env var
  // ELEVENLABS_VOICE_ID still wins so an operator can pin a different
  // voice on a side channel without code changes.
  const voiceId =
    process.env.ELEVENLABS_VOICE_ID ?? NARRATOR.tts.elevenLabsVoiceId;
  const url = `${process.env.ELEVENLABS_API_URL ?? "https://api.elevenlabs.io"}/v1/text-to-speech/${voiceId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      // ElevenLabs respects inline <break time="..."/> tags — pass the
      // SSML-laced body through unchanged. The voice_settings below are
      // tuned to match the persona's "bold, warm, confident, trainer"
      // brief:
      //   - stability 0.45 : more expressive prosody / less monotone
      //                      than 0.55, while staying steady on long takes
      //   - similarity_boost 0.85 : keep close to Rachel's natural timbre
      //   - style 0.35 : moderate stylistic emphasis (default 0; 1.0 is
      //                  too theatrical for clinical content)
      //   - use_speaker_boost true : punchier, more present mix
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.85,
        style: 0.35,
        use_speaker_boost: true,
      },
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
  const baseWpm =
    locale === "en" ? NARRATOR.tts.targetWpm : NARRATOR.tts.targetWpm * 0.85;
  return Math.max(2, (words / baseWpm) * 60);
}
// Re-export for callers that want to round-trip a plan back to plain text.
export { speechPlanToPlainText };
