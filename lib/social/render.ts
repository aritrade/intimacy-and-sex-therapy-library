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
import { scriptToSrt } from "./stt-local";
import { uploadRenderArtifact } from "./blob-host";
import { pickClipsForScript } from "./stock-clips";
import { generateAvatarVideo, AvatarRefusal } from "./avatar";
import type { GeneratedScript } from "./script-generator";

export type RenderInput = {
  draftId: string;
  script: GeneratedScript;
  language: "en" | "hi" | "hinglish";
  /**
   * Visual style. Defaults to "avatar" (talking-head persona). Other
   * styles are rendered by separate Remotion compositions and the
   * "avatar" style auto-falls back to "stock" when Replicate fails or
   * the daily USD cap is exceeded.
   */
  style?: "typography" | "stock" | "long_form_essay" | "avatar";
};

export type RenderResult = {
  videoPath: string;
  publicVideoUrl: string;
  voiceoverPath: string | null;
  publicVoiceoverUrl: string | null;
  captionsSrt: string | null;
  drift: number | null;
  totalSeconds: number;
  blobHost: "vercel-blob" | "local";
};

const FPS = 30;

const COMPOSITION_BY_STYLE: Record<NonNullable<RenderInput["style"]>, string> = {
  typography: "ShortFormVideo",
  stock: "StockReel",
  long_form_essay: "LongFormEssay",
  avatar: "AvatarReel",
};

export async function renderDraft(input: RenderInput): Promise<RenderResult> {
  const { draftId, script, language } = input;
  // Default style for new drafts is the avatar composition once the
  // persona portrait is committed and REPLICATE_API_TOKEN is set. The
  // composition falls back to "stock" automatically below when the
  // avatar generation step refuses, so this default is safe even
  // before the operator has configured Replicate.
  let style: NonNullable<RenderInput["style"]> = input.style ?? "avatar";
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

  // Hoist the voiceover to a publicly-fetchable HTTPS URL BEFORE Remotion
  // renders, because Remotion's asset downloader only handles http(s) —
  // it can't read file:// URLs or Next-style /public paths.
  //   - If BLOB_READ_WRITE_TOKEN is set, we upload to Vercel Blob and
  //     pass the HTTPS URL into the composition.
  //   - If Blob is unconfigured or upload fails, we render a silent
  //     video (renderVoiceoverUrl = null). The comp falls back to no
  //     <Audio>, which is the correct dev-mode behaviour.
  let renderVoiceoverUrl: string | null = null;
  if (voiceoverPath) {
    try {
      const ext = voiceoverPath.endsWith(".mp3") ? "mp3" : "wav";
      const r = await uploadRenderArtifact(voiceoverPath, draftId, `voiceover.${ext}`);
      if (r.hosted === "vercel-blob" && r.url.startsWith("https://")) {
        renderVoiceoverUrl = r.url;
        publicVoiceoverUrl = r.url;
      } else {
        console.warn(
          "[render] voiceover not on HTTPS host (BLOB_READ_WRITE_TOKEN unset?); rendering silent video",
        );
      }
    } catch (e) {
      console.warn(
        "[render] voiceover blob pre-upload failed; rendering silent video:",
        (e as Error).message,
      );
    }
  }

  // 2.5) Generate the talking-head avatar MP4 via Replicate when the
  //      operator chose style:"avatar" and Replicate is configured.
  //      Auto-falls back to style:"stock" on any refusal so a video is
  //      always produced; the refusal reason is logged for diagnosis.
  let avatarUrl: string | null = null;
  if (style === "avatar") {
    if (!renderVoiceoverUrl) {
      console.warn(
        "[render] avatar style requires a public HTTPS voiceover URL " +
          "(BLOB_READ_WRITE_TOKEN must be set). Falling back to style:'stock'.",
      );
      style = "stock";
    } else {
      try {
        const av = await generateAvatarVideo({
          voiceoverUrl: renderVoiceoverUrl,
          draftId,
          audioDurationSeconds: totalSeconds,
        });
        avatarUrl = av.publicUrl;
        console.log(
          `[render] avatar generated (~$${av.estimatedUsd.toFixed(3)} via ${av.modelUsed}) -> ${av.publicUrl}`,
        );
      } catch (e) {
        if (e instanceof AvatarRefusal) {
          console.warn(
            `[render] avatar refused (${e.reason}); falling back to style:'stock'. detail=${e.detail ?? ""}`,
          );
        } else {
          console.warn(
            `[render] avatar threw unexpectedly; falling back to style:'stock':`,
            (e as Error).message,
          );
        }
        style = "stock";
      }
    }
  }

  // 3) For stock / long-form / avatar styles, fetch B-roll clips per
  //    scene. Skipped (and the comp falls back to gradient orbs) when
  //    no Pexels/Pixabay key is configured.
  let scenesWithClips: Array<{ text: string; seconds: number; title?: string; clips: { url: string; attribution: string | null; width: number; height: number }[] }> = script.body.map((b) => ({
    text: b.text,
    seconds: b.seconds,
    clips: [],
  }));
  if (style === "stock" || style === "long_form_essay" || style === "avatar") {
    try {
      const perSceneClips = await pickClipsForScript(script);
      scenesWithClips = script.body.map((b, i) => ({
        text: b.text,
        seconds: b.seconds,
        title: extractFirstNoun(b.text),
        clips: (perSceneClips[i] ?? []).map((c) => ({
          url: c.url,
          attribution: c.attribution,
          width: c.width,
          height: c.height,
        })),
      }));
    } catch (e) {
      console.warn("[render] stock-clip fetch failed:", (e as Error).message);
    }
  }

  // 4) Pick the composition + override props. The AvatarReel reads
  //     `avatarUrl`; the typography / stock comps ignore it.
  const compositionInputProps = {
    hook: script.hook,
    avatarUrl,
    scenes: scenesWithClips,
    cta: script.cta,
    citationLine: script.citationLine,
    language,
    voiceoverUrl: renderVoiceoverUrl,
    totalSeconds,
  };

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: COMPOSITION_BY_STYLE[style],
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

  // 4) Captions: prefer Whisper word-timestamps when OPENAI_API_KEY is
  //    set (catches TTS pronunciation errors); otherwise synthesise SRT
  //    from the script directly. Edge TTS is deterministic, so the
  //    synthetic path is correct for the free-tier flow.
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
  if (!captionsSrt) {
    captionsSrt = scriptToSrt(fullText, totalSeconds);
  }

  // 5) Hoist the rendered MP4 to a publicly fetchable HTTPS URL so
  //    platform publishers can pull it. Voiceover was already uploaded
  //    pre-render (see above). Falls back to the local public path when
  //    BLOB_READ_WRITE_TOKEN is unset; publishers will refuse this path
  //    which is the correct "not configured" behaviour.
  const videoBlob = await uploadRenderArtifact(videoPath, draftId, "video.mp4").catch(
    (e) => {
      console.warn("[render] blob upload (video) failed:", (e as Error).message);
      return null;
    },
  );

  return {
    videoPath,
    publicVideoUrl: videoBlob?.url ?? `/renders/${draftId}/video.mp4`,
    voiceoverPath,
    publicVoiceoverUrl,
    captionsSrt,
    drift: driftScore,
    totalSeconds,
    blobHost: videoBlob?.hosted ?? "local",
  };
}

export function rendersDirExists(): boolean {
  return existsSync(join(process.cwd(), "public", "renders"));
}

/**
 * Cheap chapter-title extractor for the LongFormEssay template — picks
 * the first 2-3 word noun phrase from a scene's text. We just take the
 * first non-stopword run; not perfect, but better than empty strings.
 */
function extractFirstNoun(text: string): string {
  const stop = new Set([
    "the", "a", "an", "and", "or", "but", "if", "is", "are", "was", "were",
    "be", "to", "of", "in", "on", "at", "for", "with", "by", "from", "this",
    "that", "these", "those", "your", "their", "our", "my", "his", "her",
    "what", "which", "who", "when", "where", "why", "how", "you", "we",
    "they", "i", "it", "as", "into", "than", "then", "so", "such",
  ]);
  const words = text
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z'-]/g, ""))
    .filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    if (out.length >= 3) break;
    if (out.length === 0 && stop.has(w.toLowerCase())) continue;
    out.push(w);
    if (out.length >= 2 && /[.?!,:;]/.test(text.split(w)[1] ?? "")) break;
  }
  if (out.length === 0) return "Chapter";
  return out
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
