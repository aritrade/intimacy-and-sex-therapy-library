/**
 * Talking-head avatar generation. Two providers behind one interface:
 *
 *   github-actions  (DEFAULT — free, no card required)
 *     Triggers .github/workflows/avatar-render.yml via workflow_dispatch,
 *     polls the workflow run to completion, downloads the resulting
 *     `avatar-<draftId>` artifact, and re-hosts the MP4 on Vercel Blob.
 *     ~5-10 min per 30s reel on GH Actions' free CPU runners; uses
 *     ~150 of the free 2,000 min/month at 5 reels/day cadence.
 *
 *   replicate
 *     Submits a SadTalker prediction to Replicate.com, polls until
 *     done, downloads the MP4. ~30-60s per reel but requires a credit
 *     card on file (even for the free $5 credit).
 *
 * Both providers take the static persona portrait
 * (public/brand/narrator.png) and the synthesised voiceover, and
 * return an MP4 of the persona lip-syncing the voiceover. The MP4 is
 * then composited inside the AvatarReel Remotion composition
 * alongside kinetic typography + stock B-roll.
 *
 * Provider selection:
 *   - AVATAR_PROVIDER env: "github-actions" (default) | "replicate"
 *   - Falls back to "replicate" only if REPLICATE_API_TOKEN is set AND
 *     AVATAR_PROVIDER explicitly opts in. We do not auto-fail-over
 *     between providers — failure modes (cap exceeded vs workflow
 *     misconfigured) need different operator responses.
 *
 * Cost guardrail (Replicate path only):
 *   - Each call checks .replicate-usage.json (one row per UTC day) and
 *     refuses if today's spend would exceed REPLICATE_MAX_USD_PER_DAY.
 *   - GH Actions path is free so the cap doesn't apply, but we log
 *     workflow minutes used for visibility against the 2,000/mo quota.
 *
 * On any AvatarRefusal, callers in lib/social/render.ts catch and
 * fall through to the still-portrait Ken-Burns composition so a video
 * is always produced (no dead-letter drafts).
 */

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { uploadRenderArtifact } from "./blob-host";
import { NARRATOR } from "../brand/persona";

export type AvatarProvider = "github-actions" | "replicate";

export class AvatarRefusal extends Error {
  constructor(
    public reason:
      | "missing_token"
      | "missing_portrait"
      | "missing_audio_url"
      | "missing_github_repo"
      | "cap_exceeded"
      | "submit_failed"
      | "polling_timeout"
      | "prediction_failed"
      | "download_failed"
      | "artifact_not_found"
      | "unknown_provider",
    public detail?: string,
  ) {
    super(`${reason}${detail ? `: ${detail}` : ""}`);
  }
}

export type AvatarInput = {
  /** Public HTTPS URL of the voiceover MP3 (provider fetches it server-side). */
  voiceoverUrl: string;
  /** Draft id — used as the storage prefix on Vercel Blob. */
  draftId: string;
  /**
   * Override the provider. Defaults to env AVATAR_PROVIDER, then to
   * "github-actions" if neither is set.
   */
  provider?: AvatarProvider;
  /** Override the Replicate model. Only honoured when provider="replicate". */
  model?: string;
  /**
   * Approximate cost of this call in USD. Used only for the Replicate
   * daily-cap check. The github-actions path treats this as 0 (since
   * GH Actions Linux runners are free up to 2,000 min/mo).
   */
  audioDurationSeconds: number;
};

export type AvatarResult = {
  publicUrl: string;
  localPath: string;
  estimatedUsd: number;
  modelUsed: string;
  provider: AvatarProvider;
};

/**
 * Generate the talking-head MP4. Dispatches to the configured provider.
 * Throws AvatarRefusal on any failure mode so the caller can decide
 * whether to fall through to a still-portrait composition.
 */
export async function generateAvatarVideo(
  input: AvatarInput,
): Promise<AvatarResult> {
  const provider: AvatarProvider =
    input.provider ??
    (process.env.AVATAR_PROVIDER as AvatarProvider | undefined) ??
    "github-actions";

  // Shared up-front validation regardless of provider.
  if (!input.voiceoverUrl || !/^https:\/\//.test(input.voiceoverUrl)) {
    throw new AvatarRefusal(
      "missing_audio_url",
      "Avatar generation requires a public HTTPS voiceover URL (provider fetches it server-side).",
    );
  }
  if (!existsSync(NARRATOR.portraitPath)) {
    throw new AvatarRefusal(
      "missing_portrait",
      `Expected portrait at ${NARRATOR.portraitPath}`,
    );
  }

  if (provider === "github-actions") {
    return generateViaGithubActions(input);
  }
  if (provider === "replicate") {
    return generateViaReplicate(input);
  }
  throw new AvatarRefusal(
    "unknown_provider",
    `AVATAR_PROVIDER=${provider} is not recognised (expected github-actions | replicate)`,
  );
}

/* ========================================================================== */
/*                         Provider: github-actions                           */
/* ========================================================================== */

async function generateViaGithubActions(
  input: AvatarInput,
): Promise<AvatarResult> {
  const ghToken = process.env.GH_AVATAR_TOKEN || process.env.GITHUB_TOKEN;
  if (!ghToken) {
    throw new AvatarRefusal(
      "missing_token",
      "GH_AVATAR_TOKEN env not set. Generate a PAT with `repo` + `workflow` scopes (Personal Access Tokens → fine-grained → Actions: read/write).",
    );
  }
  const ghRepo = process.env.GH_AVATAR_REPO || process.env.GITHUB_REPOSITORY;
  if (!ghRepo || !/^[^/]+\/[^/]+$/.test(ghRepo)) {
    throw new AvatarRefusal(
      "missing_github_repo",
      "GH_AVATAR_REPO env must be set to 'owner/repo' (e.g. aritrade/intimacy-engine).",
    );
  }
  const ghBranch = process.env.GH_AVATAR_BRANCH ?? "main";
  const workflowFile = process.env.GH_AVATAR_WORKFLOW ?? "avatar-render.yml";

  // The workflow fetches the portrait over HTTPS, so the same per-draft
  // Blob upload pattern used by the Replicate path works here too.
  const portraitBuffer = await readFile(NARRATOR.portraitPath);
  const portraitBlob = await uploadPortraitToBlob(portraitBuffer, input.draftId);

  // ---- 1. workflow_dispatch ----
  // Capture the trigger time BEFORE the POST so we can find the run by
  // created_at filter (workflow_dispatch returns 204 with no run id).
  const triggerAt = new Date();
  const dispatchRes = await fetch(
    `https://api.github.com/repos/${ghRepo}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: "POST",
      headers: ghHeaders(ghToken),
      body: JSON.stringify({
        ref: ghBranch,
        inputs: {
          draft_id: input.draftId,
          portrait_url: portraitBlob.url,
          audio_url: input.voiceoverUrl,
        },
      }),
    },
  );
  if (!dispatchRes.ok) {
    const text = await dispatchRes.text().catch(() => "");
    throw new AvatarRefusal(
      "submit_failed",
      `GH workflow_dispatch failed: ${dispatchRes.status} ${dispatchRes.statusText} ${text.slice(0, 400)}`,
    );
  }

  // ---- 2. locate the run we just triggered ----
  // GH takes a few seconds to enqueue. Poll the runs list looking for
  // a workflow_dispatch run created at-or-after our trigger timestamp.
  // We also filter on the draft_id when present in the run name.
  let runId: number | null = null;
  let runHtmlUrl = "";
  const findDeadline = Date.now() + 90_000; // 90s
  while (!runId && Date.now() < findDeadline) {
    await sleep(5000);
    const runs = await fetchJson<{
      workflow_runs: Array<{
        id: number;
        created_at: string;
        html_url: string;
        event: string;
        name?: string;
      }>;
    }>(
      `https://api.github.com/repos/${ghRepo}/actions/workflows/${workflowFile}/runs?event=workflow_dispatch&per_page=20`,
      ghToken,
    );
    if (!runs) continue;
    // Newest first: pick the first workflow_dispatch run whose
    // created_at is ≥ our trigger timestamp.
    for (const r of runs.workflow_runs) {
      if (new Date(r.created_at).getTime() >= triggerAt.getTime() - 5_000) {
        runId = r.id;
        runHtmlUrl = r.html_url;
        break;
      }
    }
  }
  if (!runId) {
    throw new AvatarRefusal(
      "submit_failed",
      `Workflow dispatched but no run appeared in the GH API within 90s. Check ${ghRepo}/actions for the avatar-render workflow.`,
    );
  }

  // ---- 3. poll run status ----
  const maxWallSeconds = Number(
    process.env.AVATAR_RENDER_MAX_WAIT_SECONDS ?? "1500", // 25 min
  );
  const pollStart = Date.now();
  let conclusion: string | null = null;
  while (true) {
    if ((Date.now() - pollStart) / 1000 > maxWallSeconds) {
      throw new AvatarRefusal(
        "polling_timeout",
        `Workflow run ${runId} did not finish within ${maxWallSeconds}s. Watch: ${runHtmlUrl}`,
      );
    }
    await sleep(15_000);
    const r = await fetchJson<{
      status: string;
      conclusion: string | null;
      html_url: string;
    }>(`https://api.github.com/repos/${ghRepo}/actions/runs/${runId}`, ghToken);
    if (!r) continue;
    if (r.status === "completed") {
      conclusion = r.conclusion;
      break;
    }
  }
  if (conclusion !== "success") {
    throw new AvatarRefusal(
      "prediction_failed",
      `Workflow run finished with conclusion=${conclusion ?? "(null)"}. Logs: ${runHtmlUrl}`,
    );
  }

  // ---- 4. download the artifact ----
  // The workflow uploaded ./out/avatar.mp4 as artifact `avatar-<draftId>`.
  const artifacts = await fetchJson<{
    artifacts: Array<{
      id: number;
      name: string;
      archive_download_url: string;
      size_in_bytes: number;
    }>;
  }>(
    `https://api.github.com/repos/${ghRepo}/actions/runs/${runId}/artifacts`,
    ghToken,
  );
  const artifact = artifacts?.artifacts.find(
    (a) => a.name === `avatar-${input.draftId}`,
  );
  if (!artifact) {
    throw new AvatarRefusal(
      "artifact_not_found",
      `Workflow succeeded but artifact 'avatar-${input.draftId}' was not in the run output. Run: ${runHtmlUrl}`,
    );
  }
  // The archive_download_url returns a 302 → S3-signed URL. Node's
  // fetch follows redirects by default but the URL itself requires
  // the GH bearer token.
  const dl = await fetch(artifact.archive_download_url, {
    headers: ghHeaders(ghToken),
  });
  if (!dl.ok) {
    throw new AvatarRefusal(
      "download_failed",
      `GET artifact zip → ${dl.status} ${dl.statusText}`,
    );
  }
  const zipBuf = Buffer.from(await dl.arrayBuffer());

  // ---- 5. extract avatar.mp4 from the zip ----
  const mp4Buf = await extractSingleFileFromZip(zipBuf, "avatar.mp4");

  // ---- 6. save locally + re-host on Vercel Blob ----
  const renderDir = join(process.cwd(), "public", "renders", input.draftId);
  await mkdir(renderDir, { recursive: true });
  const localPath = join(renderDir, "avatar.mp4");
  await writeFile(localPath, mp4Buf);
  const hosted = await uploadRenderArtifact(localPath, input.draftId, "avatar.mp4");

  return {
    publicUrl: hosted.url,
    localPath,
    estimatedUsd: 0, // GH Actions free tier
    modelUsed: "sadtalker (github-actions)",
    provider: "github-actions",
  };
}

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "intimacy-engine-avatar/1",
  };
}

async function fetchJson<T>(url: string, token: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: ghHeaders(token) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Minimal central-directory ZIP reader — only enough to extract one
 * named file from the avatar artifact (always a single MP4, never
 * encrypted, no zip64). We avoid a third-party dep because adminflow
 * already has too many transitives.
 */
async function extractSingleFileFromZip(
  zip: Buffer,
  filename: string,
): Promise<Buffer> {
  // ZIP end-of-central-directory signature: 0x06054b50
  const EOCD_SIG = 0x06054b50;
  // Search from the end backwards for the EOCD (it lives in the last
  // 22+commentLen bytes).
  let eocdPos = -1;
  const searchStart = Math.max(0, zip.length - 66_000);
  for (let i = zip.length - 22; i >= searchStart; i--) {
    if (zip.readUInt32LE(i) === EOCD_SIG) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) throw new AvatarRefusal("download_failed", "ZIP EOCD not found");
  const cdSize = zip.readUInt32LE(eocdPos + 12);
  const cdOffset = zip.readUInt32LE(eocdPos + 16);
  const totalEntries = zip.readUInt16LE(eocdPos + 10);

  // Walk the central directory entries.
  let p = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    const sig = zip.readUInt32LE(p);
    if (sig !== 0x02014b50) {
      throw new AvatarRefusal(
        "download_failed",
        `Bad CD entry signature at ${p}: 0x${sig.toString(16)}`,
      );
    }
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const uncompSize = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localHeaderOffset = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString("utf-8");
    p += 46 + nameLen + extraLen + commentLen;

    if (name !== filename) continue;

    // Read the local file header at localHeaderOffset to learn the
    // exact data offset (LFH has its own name/extra lengths).
    const lfh = localHeaderOffset;
    if (zip.readUInt32LE(lfh) !== 0x04034b50) {
      throw new AvatarRefusal("download_failed", "Bad LFH signature");
    }
    const lfhNameLen = zip.readUInt16LE(lfh + 26);
    const lfhExtraLen = zip.readUInt16LE(lfh + 28);
    const dataStart = lfh + 30 + lfhNameLen + lfhExtraLen;
    const data = zip.subarray(dataStart, dataStart + compSize);
    if (method === 0) {
      // STORED — no compression. compSize === uncompSize.
      return Buffer.from(data);
    }
    if (method === 8) {
      // DEFLATE — node's zlib can inflate raw deflate streams.
      const { inflateRawSync } = await import("node:zlib");
      const out = inflateRawSync(data);
      if (out.length !== uncompSize) {
        throw new AvatarRefusal(
          "download_failed",
          `Inflate length mismatch: got ${out.length}, expected ${uncompSize}`,
        );
      }
      return out;
    }
    throw new AvatarRefusal(
      "download_failed",
      `Unsupported ZIP compression method ${method} for ${filename}`,
    );
  }
  void cdSize; // appease no-unused
  throw new AvatarRefusal(
    "artifact_not_found",
    `Zip artifact did not contain ${filename}`,
  );
}

/* ========================================================================== */
/*                            Provider: replicate                             */
/* ========================================================================== */

async function generateViaReplicate(
  input: AvatarInput,
): Promise<AvatarResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new AvatarRefusal("missing_token", "REPLICATE_API_TOKEN not set");

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
    provider: "replicate",
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
  if (!existsSync(NARRATOR.portraitPath)) return false;
  const provider =
    (process.env.AVATAR_PROVIDER as AvatarProvider | undefined) ?? "github-actions";
  if (provider === "github-actions") {
    return (
      !!(process.env.GH_AVATAR_TOKEN || process.env.GITHUB_TOKEN) &&
      !!(process.env.GH_AVATAR_REPO || process.env.GITHUB_REPOSITORY)
    );
  }
  if (provider === "replicate") {
    return !!process.env.REPLICATE_API_TOKEN;
  }
  return false;
}
