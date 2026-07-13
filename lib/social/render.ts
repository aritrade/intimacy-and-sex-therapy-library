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
import { synthesizeSegmented, type TTSResult } from "./tts";
import { transcribe, wordsToSrt, drift } from "./stt";
import { scriptToSrt } from "./stt-local";
import {
  uploadRenderArtifact,
  uploadSharedAsset,
  deleteRenderArtifact,
  type BlobHost,
} from "./blob-host";
import { pickClipsForScript } from "./stock-clips";
import { pickPhotosForScript, type StockPhoto } from "./stock-photos";
import { generateAvatarVideoChunked, AvatarRefusal } from "./avatar";
import { NARRATOR } from "../brand/persona";
import { buildSpeechPlan, speechPlanToPlainText } from "./speech-plan";
import type { GeneratedScript } from "./script-generator";

export type RenderInput = {
  draftId: string;
  script: GeneratedScript;
  language: "en" | "hi" | "hinglish";
  /**
   * Visual style. Defaults to "photo" — narrator voiceover over a
   * Ken-Burns sequence of stock photos with kinetic captions. Other
   * styles are rendered by separate Remotion compositions:
   *   - "typography"      : text-only, animated gradient backdrop
   *   - "stock"           : portrait stock VIDEOS behind captions
   *   - "photo"           : portrait stock PHOTOS (Ken-Burns) + captions
   *   - "avatar"          : talking-head lip-sync + B-roll cutaways
   *   - "long_form_essay" : 16:9 essay for YouTube
   * The "avatar" style auto-falls back to a still-portrait treatment
   * when Replicate / GitHub-Actions providers refuse or hit the daily
   * USD cap.
   */
  style?: "typography" | "stock" | "photo" | "long_form_essay" | "avatar";
};

export type RenderResult = {
  videoPath: string;
  publicVideoUrl: string;
  voiceoverPath: string | null;
  publicVoiceoverUrl: string | null;
  captionsSrt: string | null;
  drift: number | null;
  totalSeconds: number;
  blobHost: BlobHost;
};

const FPS = 30;

const COMPOSITION_BY_STYLE: Record<NonNullable<RenderInput["style"]>, string> = {
  typography: "ShortFormVideo",
  stock: "StockReel",
  photo: "PhotoReel",
  long_form_essay: "LongFormEssay",
  avatar: "AvatarReel",
};

export async function renderDraft(input: RenderInput): Promise<RenderResult> {
  const { draftId, script, language } = input;
  // Default visual style is "photo" — narrator voiceover over a
  // Ken-Burns sequence of stock photos. Reasons:
  //   - works on the free tier (no Replicate, no GH Actions GPU)
  //   - renders fast (no per-frame video decode)
  //   - Pexels/Pixabay have abundant 9:16 portrait photos vs. the very
  //     scarce 9:16 portrait stock VIDEOS the "stock" path depends on
  //   - documentary motion treatment reads as intentional, not slideshow-y
  // The "avatar" style is preserved as opt-in for when we eventually
  // wire a paid lip-sync provider.
  let style: NonNullable<RenderInput["style"]> = input.style ?? "photo";
  const renderDir = join(process.cwd(), "public", "renders", draftId);
  await mkdir(renderDir, { recursive: true });

  // Build the speech plan — an ordered list of (text, silenceMsAfter)
  // segments. Segmenting up front is required because Edge TTS's free
  // WSS endpoint rejects every pause SSML element, so inter-scene gaps
  // have to be inserted as real silence via ffmpeg between per-segment
  // synthesis calls. See lib/social/speech-plan.ts for the full rationale.
  const speechPlan = buildSpeechPlan(script);
  const plainText = speechPlanToPlainText(speechPlan);
  const segmentLabels = speechPlan
    .map((s, i) => `${s.kind}#${i}(${s.silenceMsAfter}ms)`)
    .join(" ");
  console.log(`[render] speech plan: ${segmentLabels}`);

  // 1) TTS — per-segment synthesis + ffmpeg-stitched silence between.
  let tts: TTSResult | null = null;
  try {
    tts = await synthesizeSegmented(speechPlan, language);
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
  // Pathname of the voiceover blob, captured so we can delete it once the
  // MP4 (which has the audio baked in) is hosted — see the cleanup at the
  // end. The voiceover is only needed transiently, during this render.
  let voiceoverBlobPathname: string | null = null;
  if (voiceoverPath) {
    try {
      const ext = voiceoverPath.endsWith(".mp3") ? "mp3" : "wav";
      const r = await uploadRenderArtifact(voiceoverPath, draftId, `voiceover.${ext}`);
      if (r.hosted !== "local" && r.url.startsWith("https://")) {
        renderVoiceoverUrl = r.url;
        publicVoiceoverUrl = r.url;
        voiceoverBlobPathname = r.pathname;
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

  // 2.5) Pre-upload the persona portrait so AvatarReel / PhotoReel can
  //      reference it via HTTPS (Remotion's bundler can't fetch
  //      Next-style /public paths during render). For AvatarReel it's
  //      also what gets passed to Replicate as source_image when the
  //      lip-sync path is available. PhotoReel uses it as the small
  //      circular host badge at hook + CTA.
  //
  //      The portrait is IDENTICAL across drafts, so we host it once at a
  //      content-addressed `assets/` path (uploadSharedAsset) and reuse
  //      that single object on every render — instead of copying the same
  //      ~500KB PNG into each `renders/<draftId>/` folder, which scaled
  //      storage (and re-uploads) linearly with the draft count.
  let portraitUrl: string | null = null;
  if (
    (style === "avatar" || style === "photo") &&
    existsSync(NARRATOR.portraitPath)
  ) {
    try {
      const r = await uploadSharedAsset(NARRATOR.portraitPath, "narrator.png");
      if (r.hosted !== "local" && r.url.startsWith("https://")) {
        portraitUrl = r.url;
      } else {
        console.warn(
          "[render] portrait not on HTTPS host (BLOB_READ_WRITE_TOKEN unset?); composition will render without the host badge",
        );
      }
    } catch (e) {
      console.warn(
        "[render] portrait pre-upload failed; composition will render without the host badge:",
        (e as Error).message,
      );
    }
  }

  // 2.6) Generate the talking-head avatar MP4 via Replicate when the
  //      operator chose style:"avatar" and Replicate is configured.
  //      On any refusal we KEEP style:"avatar" but render the AvatarReel
  //      composition with avatarUrl=null — the comp falls back to a
  //      Ken-Burns still of the persona portrait so the visual identity
  //      stays consistent. The refusal reason is logged for diagnosis.
  let avatarUrl: string | null = null;
  if (style === "avatar") {
    if (!renderVoiceoverUrl) {
      console.warn(
        "[render] avatar lip-sync skipped: no HTTPS voiceover URL " +
          "(BLOB_READ_WRITE_TOKEN may be unset). AvatarReel will use the still-portrait fallback.",
      );
    } else {
      try {
        // Use the chunked entry point so long-form essays (>45s) get
        // split into ≤30s segments and stitched back together — SadTalker
        // (and every talking-head model on Replicate) degrades visibly
        // past ~45s, so single-shot generation of a 4-min essay produces
        // a drifting/desyncing avatar. The chunked wrapper is a no-op for
        // audio ≤ AVATAR_CHUNK_THRESHOLD_SECONDS (default 45s), so this
        // is safe to use unconditionally.
        const av = await generateAvatarVideoChunked({
          voiceoverUrl: renderVoiceoverUrl,
          voiceoverLocalPath: voiceoverPath ?? undefined,
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
            `[render] avatar lip-sync refused (${e.reason}); AvatarReel will use the still-portrait fallback. detail=${e.detail ?? ""}`,
          );
        } else {
          console.warn(
            `[render] avatar lip-sync threw unexpectedly; AvatarReel will use the still-portrait fallback:`,
            (e as Error).message,
          );
        }
      }
    }
  }

  // 3a) For stock / long-form / avatar styles, fetch B-roll VIDEO clips
  //     per scene. Skipped (and the comp falls back to gradient orbs)
  //     when no Pexels/Pixabay key is configured.
  let scenesWithClips: Array<{
    text: string;
    seconds: number;
    title?: string;
    clips: { url: string; attribution: string | null; width: number; height: number }[];
  }> = script.body.map((b) => ({
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

  // 3b) For the photo style, fetch portrait stock PHOTOS per scene.
  //     2 photos per body scene gives each photo ~2.5-3s of screen time
  //     at our standard scene length. 3 felt visually rushed — viewers
  //     barely registered each image before it crossfaded. 1 felt too
  //     static. 2 hits the calm-explainer rhythm without going slideshow.
  let scenesWithPhotos: Array<{
    text: string;
    seconds: number;
    photos: { url: string; attribution: string | null; width: number; height: number }[];
  }> = script.body.map((b) => ({
    text: b.text,
    seconds: b.seconds,
    photos: [],
  }));
  if (style === "photo") {
    try {
      const perScenePhotos: StockPhoto[][] = await pickPhotosForScript(script, 2);
      scenesWithPhotos = script.body.map((b, i) => ({
        text: b.text,
        seconds: b.seconds,
        photos: (perScenePhotos[i] ?? []).map((p) => ({
          url: p.url,
          attribution: p.attribution,
          width: p.width,
          height: p.height,
        })),
      }));
      const totalPhotos = scenesWithPhotos.reduce((acc, s) => acc + s.photos.length, 0);
      console.log(
        `[render] stock photos fetched: ${totalPhotos} across ${scenesWithPhotos.length} scenes`,
      );
    } catch (e) {
      console.warn("[render] stock-photo fetch failed:", (e as Error).message);
    }
  }

  // 4) Pick the composition + override props.
  //     - PhotoReel reads `scenes[].photos` + `portraitUrl`
  //     - AvatarReel reads `scenes[].clips` + `avatarUrl` + `portraitUrl`
  //     - StockReel / LongFormEssay read `scenes[].clips`
  //     - ShortFormVideo ignores both
  //    We build a discriminated shape so the renderer always sees the
  //    right field for the chosen composition.
  const baseProps = {
    hook: script.hook,
    cta: script.cta,
    citationLine: script.citationLine,
    language,
    voiceoverUrl: renderVoiceoverUrl,
    totalSeconds,
  };
  const compositionInputProps =
    style === "photo"
      ? {
          ...baseProps,
          portraitUrl,
          scenes: scenesWithPhotos,
        }
      : {
          ...baseProps,
          avatarUrl,
          portraitUrl,
          scenes: scenesWithClips,
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
  //    Drift comparison uses the SSML-stripped plain text — otherwise
  //    every <break> tag in the source would count as a missed word.
  let captionsSrt: string | null = null;
  let driftScore: number | null = null;
  if (tts) {
    try {
      const w = await transcribe(tts.audio, tts.mime);
      if (w) {
        captionsSrt = wordsToSrt(w.words);
        driftScore = drift(plainText, w.text);
      }
    } catch (e) {
      console.warn("[render] Whisper failed:", (e as Error).message);
    }
  }
  if (!captionsSrt) {
    captionsSrt = scriptToSrt(plainText, totalSeconds);
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

  // The video MUST land on a public HTTPS host (Vercel Blob). The local
  // `/renders/<id>/video.mp4` path only resolves under `next dev` on a
  // developer laptop — it 404s on the deployment because `public/renders/`
  // is gitignored and renders run on ephemeral CI runners whose filesystem
  // is discarded. Persisting that local path into the DB produces a broken
  // admin preview AND silently de-queues the draft from re-render (the
  // batch scan in scripts/render-due.ts keys off `video_url IS NULL`), so
  // the draft gets permanently stuck with a dead URL.
  //
  // Therefore, on any hosted / CI run we refuse to continue with a
  // non-HTTPS video URL. Throwing keeps `video_url` NULL → the draft stays
  // eligible for the next render pass, and the failure surfaces in the
  // workflow summary + audit log instead of shipping a 404. Local dev still
  // gets the `/renders/...` path so `next dev` previews keep working.
  const videoHostedHttps =
    !!videoBlob &&
    videoBlob.hosted !== "local" &&
    videoBlob.url.startsWith("https://");
  const requirePublicHost = !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.VERCEL
  );
  if (!videoHostedHttps && requirePublicHost) {
    throw new Error(
      "video rendered but could not be hoisted to Vercel Blob " +
        "(BLOB_READ_WRITE_TOKEN missing/invalid or the upload failed). " +
        "Refusing to persist a local /renders path that 404s on the " +
        "deployment — leaving video_url unset so the draft re-renders.",
    );
  }
  if (!videoHostedHttps) {
    console.warn(
      "[render] video not on an HTTPS blob host; falling back to the local " +
        "/renders path (only works under `next dev`). Set BLOB_READ_WRITE_TOKEN " +
        "to host it for the deployment.",
    );
  }

  // Reclaim the transient voiceover blob now that the MP4 is hosted: the
  // audio is muxed into video.mp4, the DB `voiceover_url` column is never
  // read back (publishers pull video.mp4, which carries the audio), and a
  // re-render regenerates the voiceover from scratch. Leaving it in Blob
  // just burned free-tier storage until the draft eventually hit
  // `posted`/`taken_down` and the prune swept it. Best-effort: a failed
  // delete must not fail the render.
  let voiceoverReclaimed = false;
  if (videoHostedHttps && voiceoverBlobPathname) {
    try {
      await deleteRenderArtifact(voiceoverBlobPathname);
      voiceoverReclaimed = true;
    } catch (e) {
      console.warn(
        "[render] voiceover blob cleanup failed (non-fatal):",
        (e as Error).message,
      );
    }
  }

  // Append a per-render cache-buster to the stored URLs. Vercel Blob
  // serves with a long max-age (see blob-host.ts cacheControlMaxAge), and
  // re-renders write back to the same path inside `renders/<draftId>/`,
  // so browsers (and the admin queue UI) would happily replay a stale
  // copy of the previous render at the same URL. A query-string version
  // tag is the cheapest fix: same blob path (idempotent storage), new
  // cache key (always-fresh fetch).
  const renderStamp = Date.now();
  const publicVideoUrl = videoHostedHttps
    ? appendCacheBuster(videoBlob!.url, renderStamp)
    : `/renders/${draftId}/video.mp4?v=${renderStamp}`;
  // Don't persist a URL we just deleted — it would 404. The voiceover is
  // an internal render input, not a published artifact.
  const versionedVoiceoverUrl =
    publicVoiceoverUrl && !voiceoverReclaimed
      ? appendCacheBuster(publicVoiceoverUrl, renderStamp)
      : null;

  return {
    videoPath,
    publicVideoUrl,
    voiceoverPath,
    publicVoiceoverUrl: versionedVoiceoverUrl,
    captionsSrt,
    drift: driftScore,
    totalSeconds,
    blobHost: videoBlob?.hosted ?? "local",
  };
}

function appendCacheBuster(url: string, stamp: number): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${stamp}`;
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
