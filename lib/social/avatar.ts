/**
 * Talking-head avatar generation via Replicate.com.
 *
 * Takes the static persona portrait (public/brand/narrator.png) and the
 * synthesised voiceover, returns an MP4 of the persona lip-syncing the
 * voiceover. The MP4 is then composited inside the AvatarReel Remotion
 * composition alongside kinetic typography + stock B-roll.
 *
 * Why Replicate instead of HeyGen/D-ID:
 *   - $5 of free credit covers ~50 short videos, enough to validate
 *     the pipeline before paying anything.
 *   - After credit, ~$0.05-$0.20 per 30s reel — ~10x cheaper than
 *     HeyGen, ~3x cheaper than D-ID's paid tier.
 *   - Hosts open-source models (Hallo, SadTalker) behind a stable REST
 *     API so we're not locked to a single vendor's video format.
 *
 * Why no SDK dep:
 *   - The Replicate REST API is three endpoints. The official SDK adds
 *     a transitive node-fetch polyfill we don't need on Node 20+.
 *   - Rolling our own keeps the polling logic auditable and lets us
 *     enforce a hard wall-clock cap.
 *
 * Cost guardrail:
 *   - Each call checks .replicate-usage.json (one row per UTC day) and
 *     refuses if today's spend would exceed REPLICATE_MAX_USD_PER_DAY.
 *   - This is intentionally per-process (CLI render runs locally) +
 *     per-machine. The Vercel cron path doesn't render today so we
 *     don't need a distributed counter yet.
 *
 * Falls back to throwing AvatarRefusal when token/cap/network fails;
 * callers in lib/social/render.ts catch and fall through to the
 * existing stock-clip composition so a video is always produced.
 */

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { uploadRenderArtifact } from "./blob-host";
import { NARRATOR } from "../brand/persona";

export class AvatarRefusal extends Error {
  constructor(
    public reason:
      | "missing_token"
      | "missing_portrait"
      | "missing_audio_url"
      | "cap_exceeded"
      | "submit_failed"
      | "polling_timeout"
      | "prediction_failed"
      | "download_failed",
    public detail?: string,
  ) {
    super(`${reason}${detail ? `: ${detail}` : ""}`);
  }
}

export type AvatarInput = {
  /** Public HTTPS URL of the voiceover MP3 (Replicate fetches it). */
  voiceoverUrl: string;
  /** Draft id — used as the storage prefix on Vercel Blob. */
  draftId: string;
  /** Override the Replicate model. Defaults to env or Hallo. */
  model?: string;
  /**
   * Approximate cost of this call in USD. We use the model's
   * published per-second cost from the env (REPLICATE_USD_PER_SECOND,
   * default $0.005) multiplied by the audio duration. Conservative
   * so the cap triggers before billing surprises.
   */
  audioDurationSeconds: number;
};

export type AvatarResult = {
  publicUrl: string;
  localPath: string;
  estimatedUsd: number;
  modelUsed: string;
};

/**
 * Generate the talking-head MP4. Throws AvatarRefusal on any failure
 * mode so the caller can decide whether to fall through to a non-
 * avatar composition.
 */
export async function generateAvatarVideo(
  input: AvatarInput,
): Promise<AvatarResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new AvatarRefusal("missing_token");

  if (!input.voiceoverUrl || !/^https:\/\//.test(input.voiceoverUrl)) {
    throw new AvatarRefusal(
      "missing_audio_url",
      "Avatar generation requires a public HTTPS voiceover URL (Replicate fetches it server-side).",
    );
  }
  if (!existsSync(NARRATOR.portraitPath)) {
    throw new AvatarRefusal(
      "missing_portrait",
      `Expected portrait at ${NARRATOR.portraitPath}`,
    );
  }

  // Estimate the cost of this call BEFORE submitting so we can refuse
  // up-front when the daily cap would be exceeded.
  const usdPerSecond = Number(
    process.env.REPLICATE_USD_PER_SECOND ?? "0.005",
  );
  const estimatedUsd = input.audioDurationSeconds * usdPerSecond;
  await assertWithinDailyCap(estimatedUsd);

  // Replicate needs an HTTPS URL for the portrait too. Upload it once
  // per draft (idempotent — Blob put() with the same pathname replaces).
  const portraitBuffer = await readFile(NARRATOR.portraitPath);
  const portraitBlob = await uploadPortraitToBlob(portraitBuffer, input.draftId);

  // Model: default to cjwbw/sadtalker — 169K+ runs on Replicate, the
  // most battle-tested still-image talking-head model. Output quality
  // is "okay TikTok-grade" (not photorealistic — Hallo/AniPortrait are
  // better but were not available on Replicate at the time we picked).
  // Operators can swap via REPLICATE_AVATAR_MODEL when something
  // higher-fidelity ships. Input/output mapping below assumes the
  // SadTalker schema; revisit when changing models.
  const model =
    input.model ??
    process.env.REPLICATE_AVATAR_MODEL ??
    "cjwbw/sadtalker";

  // SadTalker's input keys are source_image + driven_audio. Other
  // models name them differently (Wav2Lip uses face/audio; AniPortrait
  // uses ref_img/wav). Centralise the mapping in one place so the
  // swap is a single edit.
  const inputPayload = sadTalkerInput(model, portraitBlob.url, input.voiceoverUrl);

  // Replicate has two prediction endpoints:
  //   - POST /v1/models/<owner>/<name>/predictions   (official models only)
  //   - POST /v1/predictions  with { version: <hash> } (works for all
  //                                                      community models)
  // SadTalker and most other talking-head models on Replicate are
  // community-hosted, so we always use the version-pinned form. We
  // resolve the model's current latest_version on every call so the
  // version hash never goes stale.
  const versionRes = await fetch(
    `https://api.replicate.com/v1/models/${model}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!versionRes.ok) {
    const text = await versionRes.text().catch(() => "");
    throw new AvatarRefusal(
      "submit_failed",
      `Could not resolve model ${model}: ${versionRes.status} ${versionRes.statusText} ${text.slice(0, 300)}`,
    );
  }
  const modelMeta = (await versionRes.json()) as {
    latest_version?: { id?: string };
  };
  const versionId = modelMeta.latest_version?.id;
  if (!versionId) {
    throw new AvatarRefusal(
      "submit_failed",
      `Model ${model} has no latest_version. The model may be unpublished or private.`,
    );
  }

  // Synchronous waiting (Prefer: wait) is capped at 60s on Replicate's
  // side, so we fall back to async polling when needed.
  const submitRes = await fetch(
    `https://api.replicate.com/v1/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait=60",
      },
      body: JSON.stringify({ version: versionId, input: inputPayload }),
    },
  );
  if (!submitRes.ok) {
    const text = await submitRes.text().catch(() => "");
    throw new AvatarRefusal(
      "submit_failed",
      `${submitRes.status} ${submitRes.statusText}: ${text.slice(0, 500)}`,
    );
  }
  let prediction = (await submitRes.json()) as ReplicatePrediction;

  // If the synchronous wait didn't get us all the way to done, poll.
  const maxWallSeconds = Number(
    process.env.REPLICATE_MAX_WAIT_SECONDS ?? "600",
  );
  const pollStart = Date.now();
  while (
    prediction.status === "starting" ||
    prediction.status === "processing"
  ) {
    if ((Date.now() - pollStart) / 1000 > maxWallSeconds) {
      throw new AvatarRefusal(
        "polling_timeout",
        `Prediction ${prediction.id} stuck at ${prediction.status} after ${maxWallSeconds}s`,
      );
    }
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${prediction.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!pollRes.ok) {
      // Transient network — keep trying until we hit maxWallSeconds.
      continue;
    }
    prediction = (await pollRes.json()) as ReplicatePrediction;
  }

  if (prediction.status !== "succeeded") {
    throw new AvatarRefusal(
      "prediction_failed",
      `${prediction.status}: ${prediction.error ?? "(no error)"} ` +
        `logs=${(prediction.logs ?? "").slice(-400)}`,
    );
  }

  // Output shape varies by model. Hallo returns a string URL; some
  // models return [url]. Normalise.
  const outputUrl =
    typeof prediction.output === "string"
      ? prediction.output
      : Array.isArray(prediction.output)
        ? prediction.output[0]
        : null;
  if (!outputUrl || typeof outputUrl !== "string") {
    throw new AvatarRefusal(
      "prediction_failed",
      `Could not extract MP4 URL from output: ${JSON.stringify(prediction.output).slice(0, 200)}`,
    );
  }

  // Stream the MP4 to local disk so Remotion can include it in the
  // composition without re-downloading per frame.
  const renderDir = join(process.cwd(), "public", "renders", input.draftId);
  await mkdir(renderDir, { recursive: true });
  const localPath = join(renderDir, "avatar.mp4");
  const dl = await fetch(outputUrl);
  if (!dl.ok) {
    throw new AvatarRefusal(
      "download_failed",
      `GET ${outputUrl} → ${dl.status} ${dl.statusText}`,
    );
  }
  const mp4 = Buffer.from(await dl.arrayBuffer());
  await writeFile(localPath, mp4);

  // Re-host on Vercel Blob so Remotion can pull it via HTTPS at render
  // time (Remotion's renderer rejects file:// and local public paths
  // for remote-bundle composition props).
  const hosted = await uploadRenderArtifact(localPath, input.draftId, "avatar.mp4");

  // Record usage for the daily-cap check.
  await recordUsage(estimatedUsd);

  return {
    publicUrl: hosted.url,
    localPath,
    estimatedUsd,
    modelUsed: model,
  };
}

type ReplicatePrediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string | string[] | null;
  error: string | null;
  logs: string | null;
};

/**
 * Map our generic { portrait, voiceover } pair into the model's
 * specific input schema. Most models on Replicate name the keys
 * differently (SadTalker: source_image / driven_audio; Wav2Lip:
 * face / audio; AniPortrait: ref_img / wav). When you swap models
 * via REPLICATE_AVATAR_MODEL, add a branch here so the rest of the
 * pipeline doesn't change.
 */
function sadTalkerInput(
  model: string,
  portraitUrl: string,
  audioUrl: string,
): Record<string, unknown> {
  const lower = model.toLowerCase();
  if (lower.includes("sadtalker")) {
    return {
      source_image: portraitUrl,
      driven_audio: audioUrl,
      preprocess: "full",
      // still=true reduces head-bob — better fit for the "trusted
      // late-night radio host" persona where the head shouldn't
      // bounce around.
      still: true,
      enhancer: "gfpgan",
    };
  }
  if (lower.includes("wav2lip")) {
    return { face: portraitUrl, audio: audioUrl };
  }
  if (lower.includes("aniportrait")) {
    return { ref_img: portraitUrl, audio_path: audioUrl };
  }
  // Sensible fallback that matches the older Hallo schema some forks
  // still expose. If a new model takes neither shape, the submit
  // POST will return 422 and we'll surface it as AvatarRefusal.
  return { source_image: portraitUrl, driving_audio: audioUrl };
}

async function uploadPortraitToBlob(buffer: Buffer, draftId: string) {
  // Use the existing helper but write to a stable per-draft path so
  // each render gets a fresh portrait URL Replicate can fetch. We
  // could share a single global portrait URL too, but per-draft makes
  // takedown / debugging easier later.
  const renderDir = join(process.cwd(), "public", "renders", draftId);
  await mkdir(renderDir, { recursive: true });
  const portraitTmp = join(renderDir, "narrator.png");
  await writeFile(portraitTmp, buffer);
  return uploadRenderArtifact(portraitTmp, draftId, "narrator.png");
}

/* ------------------------- daily-cap bookkeeping ------------------------- */

type UsageFile = {
  date: string; // YYYY-MM-DD UTC
  usd: number;
  calls: number;
};

const USAGE_PATH = join(process.cwd(), ".replicate-usage.json");

async function readUsage(): Promise<UsageFile> {
  const today = new Date().toISOString().slice(0, 10);
  if (!existsSync(USAGE_PATH)) return { date: today, usd: 0, calls: 0 };
  try {
    const s = await stat(USAGE_PATH);
    if (s.size === 0) return { date: today, usd: 0, calls: 0 };
    const data = JSON.parse(
      (await readFile(USAGE_PATH, "utf-8")).toString(),
    ) as UsageFile;
    if (data.date !== today) return { date: today, usd: 0, calls: 0 };
    return data;
  } catch {
    return { date: today, usd: 0, calls: 0 };
  }
}

async function assertWithinDailyCap(estimatedUsd: number): Promise<void> {
  const capUsd = Number(process.env.REPLICATE_MAX_USD_PER_DAY ?? "2.00");
  const usage = await readUsage();
  if (usage.usd + estimatedUsd > capUsd) {
    throw new AvatarRefusal(
      "cap_exceeded",
      `Today's projected spend $${(usage.usd + estimatedUsd).toFixed(3)} exceeds ` +
        `REPLICATE_MAX_USD_PER_DAY=$${capUsd.toFixed(2)} ` +
        `(already spent $${usage.usd.toFixed(3)} across ${usage.calls} call(s))`,
    );
  }
}

async function recordUsage(estimatedUsd: number): Promise<void> {
  const usage = await readUsage();
  const next: UsageFile = {
    date: usage.date,
    usd: usage.usd + estimatedUsd,
    calls: usage.calls + 1,
  };
  await writeFile(USAGE_PATH, JSON.stringify(next, null, 2), "utf-8");
}

export function isAvatarConfigured(): boolean {
  return !!process.env.REPLICATE_API_TOKEN && existsSync(NARRATOR.portraitPath);
}
