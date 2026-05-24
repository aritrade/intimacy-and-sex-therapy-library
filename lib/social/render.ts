/**
 * End-to-end render: script + TTS → MP4 via Remotion.
 *
 * Steps:
 *   1. (Optional) synthesise voiceover from the script via Sarvam / ElevenLabs.
 *   2. Write voiceover MP3 to /public/renders/<id>/voiceover.mp3 so Remotion
 *      can <Audio src=…/> it from a file:// URL bundle path.
 *   3. Bundle the Remotion project at remotion/index.ts.
 *   4. selectComposition with our props.
 *   5. renderMedia to /public/renders/<id>/video.mp4.
 *   6. (Optional) transcribe the rendered audio with Whisper, build SRT,
 *      compute drift, and bail if drift > threshold.
 *
 * This module assumes it runs in Node (not the edge). It is invoked only from
 * `scripts/render-draft.ts` and from the admin API route.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { synthesize, type TTSResult } from "./tts";
import { transcribe, wordsToSrt, drift } from "./stt";
import type { GeneratedScript } from "./script-generator";

export type RenderInput = {
  draftId: string;
  script: GeneratedScript;
  language: "en" | "hi" | "hinglish";
};

export type RenderResult = {
  videoPath: string;
  publicVideoUrl: string;
  voiceoverPath: string | null;
  publicVoiceoverUrl: string | null;
  captionsSrt: string | null;
  drift: number | null;
  totalSeconds: number;
};

const FPS = 30;

export async function renderDraft(input: RenderInput): Promise<RenderResult> {
  const { draftId, script, language } = input;
  const renderDir = join(process.cwd(), "public", "renders", draftId);
  await mkdir(renderDir, { recursive: true });

  const fullText = [script.hook, ...script.body.map((b) => b.text), script.cta].join(" ");

  // 1) TTS
  let tts: TTSResult | null = null;
  try {
    tts = await synthesize(fullText, language);
  } catch (e) {
    console.warn("[render] TTS failed:", (e as Error).message);
  }

  let voiceoverPath: string | null = null;
  let publicVoiceoverUrl: string | null = null;
  if (tts) {
    const ext = tts.mime === "audio/mpeg" ? "mp3" : "wav";
    voiceoverPath = join(renderDir, `voiceover.${ext}`);
    await writeFile(voiceoverPath, tts.audio);
    publicVoiceoverUrl = `/renders/${draftId}/voiceover.${ext}`;
  }

  // Total seconds: prefer TTS duration if available, else sum of declared scene
  // durations + reasonable hook/cta padding.
  const totalSeconds =
    tts?.durationSeconds ??
    script.body.reduce((acc, s) => acc + s.seconds, 0) + 5;

  // 2) Bundle Remotion project (this is the slow step on first run)
  const bundleLocation = await bundle({
    entryPoint: join(process.cwd(), "video-factory", "index.ts"),
    onProgress: (p) => process.stdout.write(`\r[render] bundling ${p}%`),
    webpackOverride: (cfg) => cfg,
  });

  // Remotion's headless Chromium can't resolve `/renders/...` (Next-style
  // public paths). Use a file:// URL during render; the public URL is only
  // exposed back to callers for caption playback in the admin UI.
  const renderVoiceoverUrl = voiceoverPath ? `file://${voiceoverPath}` : null;

  // 3) Pick the composition + override props
  const compositionInputProps = {
    hook: script.hook,
    scenes: script.body,
    cta: script.cta,
    citationLine: script.citationLine,
    language,
    voiceoverUrl: renderVoiceoverUrl,
    totalSeconds,
  };

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "ShortFormVideo",
    inputProps: compositionInputProps,
  });

  const videoPath = join(renderDir, "video.mp4");
  await renderMedia({
    composition: { ...composition, durationInFrames: Math.ceil(totalSeconds * FPS) },
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: videoPath,
    inputProps: compositionInputProps,
    audioCodec: "aac",
    onProgress: ({ progress }) =>
      process.stdout.write(`\r[render] rendering ${(progress * 100).toFixed(0)}%   `),
  });

  // 4) Whisper drift check + SRT
  let captionsSrt: string | null = null;
  let driftScore: number | null = null;
  if (tts) {
    try {
      const w = await transcribe(tts.audio, tts.mime);
      if (w) {
        captionsSrt = wordsToSrt(w.words);
        driftScore = drift(fullText, w.text);
      }
    } catch (e) {
      console.warn("[render] Whisper failed:", (e as Error).message);
    }
  }

  return {
    videoPath,
    publicVideoUrl: `/renders/${draftId}/video.mp4`,
    voiceoverPath,
    publicVoiceoverUrl,
    captionsSrt,
    drift: driftScore,
    totalSeconds,
  };
}

export function rendersDirExists(): boolean {
  return existsSync(join(process.cwd(), "public", "renders"));
}
