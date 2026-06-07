/**
 * Renders the homepage primer film.
 *
 *   1. Merge marketing/primer/script.json (content) with
 *      marketing/primer/timings.json (per-scene narration lengths).
 *   2. Bundle the Remotion project and render the `Primer` composition to a
 *      SILENT mp4 (Remotion never touches the audio file — avoids the
 *      http(s)-only asset-downloader limitation).
 *   3. Mux public/marketing/primer-vo.mp3 onto the silent video with ffmpeg.
 *   4. Extract a poster frame.
 *
 * Prereqs (run first): `python3 marketing/primer/build_audio.py`
 * Usage: `npx tsx scripts/render-primer.ts`
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";

const ROOT = process.cwd();
const PUBLIC = join(ROOT, "public", "marketing");
const SILENT = join(PUBLIC, "_primer-silent.mp4");
const VO = join(PUBLIC, "primer-vo.mp3");
const OUT = join(PUBLIC, "primer.mp4");
const POSTER = join(PUBLIC, "primer-poster.jpg");

type Scene = Record<string, unknown> & { id: string; seconds?: number };

async function main() {
  const script = JSON.parse(
    readFileSync(join(ROOT, "marketing", "primer", "script.json"), "utf-8"),
  ) as { scenes: Scene[] };
  const timingsPath = join(ROOT, "marketing", "primer", "timings.json");
  if (!existsSync(timingsPath)) {
    throw new Error("timings.json missing — run `python3 marketing/primer/build_audio.py` first");
  }
  const timings = JSON.parse(readFileSync(timingsPath, "utf-8")) as {
    total: number;
    scenes: { id: string; seconds: number }[];
  };
  const byId = new Map(timings.scenes.map((t) => [t.id, t.seconds]));
  const scenes = script.scenes.map((s) => ({ ...s, seconds: byId.get(s.id) ?? 16 }));
  const totalSeconds = scenes.reduce((acc, s) => acc + s.seconds, 0);
  console.log(`[primer] ${scenes.length} scenes, ${totalSeconds.toFixed(1)}s (${(totalSeconds / 60).toFixed(2)} min)`);

  await ensureBrowser();

  console.log("[primer] bundling…");
  const serveUrl = await bundle({
    entryPoint: join(ROOT, "video-factory", "index.ts"),
    onProgress: (p) => process.stdout.write(`\r[primer] bundle ${p}%   `),
  });
  process.stdout.write("\n");

  const inputProps = { scenes, totalSeconds };
  const composition = await selectComposition({ serveUrl, id: "Primer", inputProps });

  console.log(`[primer] rendering ${composition.durationInFrames} frames @ ${composition.fps}fps…`);
  await renderMedia({
    serveUrl,
    composition,
    codec: "h264",
    outputLocation: SILENT,
    inputProps,
    crf: 18,
    imageFormat: "jpeg",
    jpegQuality: 90,
    onProgress: ({ progress }) =>
      process.stdout.write(`\r[primer] render ${(progress * 100).toFixed(0)}%   `),
  });
  process.stdout.write("\n");

  if (!existsSync(VO)) throw new Error(`narration missing at ${VO}`);
  console.log("[primer] muxing narration + web encode…");
  // IMPORTANT: map streams explicitly. Remotion emits a SILENT audio track on
  // the silent render, so without `-map 1:a:0` ffmpeg's default selection would
  // pick that empty track and the film would have no sound. We also re-encode
  // the video here (crf 23) so the homepage gets a web-friendly ~30 MB file in
  // one pass instead of the ~65 MB crf-18 master.
  execFileSync(
    "ffmpeg",
    [
      "-y", "-i", SILENT, "-i", VO,
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k",
      "-shortest", "-movflags", "+faststart", OUT,
    ],
    { stdio: "ignore" },
  );

  console.log("[primer] poster…");
  execFileSync(
    "ffmpeg",
    ["-y", "-ss", "3.5", "-i", OUT, "-frames:v", "1", "-q:v", "3", POSTER],
    { stdio: "ignore" },
  );

  rmSync(SILENT, { force: true });
  console.log(`[primer] done → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
