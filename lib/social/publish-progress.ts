/**
 * Shared progress-event shape for the streaming publish endpoint.
 *
 * The /api/admin/drafts/[id]/publish-stream route returns NDJSON
 * (one JSON event per line) that the admin UI consumes as a
 * `ReadableStream`. Each event is one of these shapes.
 *
 * The same vocabulary is used by:
 *   - lib/social/publish.ts             — orchestrator that fan-outs
 *   - lib/social/publishers/{ig,yt,fb}  — individual publishers report
 *                                          their own granular progress
 *   - components/admin/PublishProgress  — frontend renderer
 *
 * Wire format examples (one JSON object per line, terminated `\n`):
 *
 *   {"event":"start","platforms":["instagram","youtube","facebook"]}
 *   {"event":"platform_start","platform":"instagram"}
 *   {"event":"platform_stage","platform":"instagram","stage":"container_create","pct":10}
 *   {"event":"platform_stage","platform":"instagram","stage":"warmup","pct":35}
 *   {"event":"platform_stage","platform":"instagram","stage":"publish_attempt","pct":60,"attempt":1}
 *   {"event":"platform_done","platform":"instagram","ok":true,"postId":"18..."}
 *   {"event":"platform_done","platform":"youtube","ok":false,"reason":"insufficient_scope","detail":"..."}
 *   {"event":"platform_skipped","platform":"facebook","reason":"already_posted","existingId":"122..."}
 *   {"event":"done","ok":true,"platformPostIds":{...},"failures":[],"skipped":["facebook"]}
 */

export type PublishStage =
  | "queued"
  | "container_create"
  | "uploading"
  | "warmup"
  | "publish_attempt"
  | "transcoding_wait"
  | "finalising";

export type ProgressEvent =
  | { event: "start"; platforms: string[]; draftId: string }
  | { event: "platform_start"; platform: string }
  | {
      event: "platform_stage";
      platform: string;
      stage: PublishStage;
      pct: number;
      attempt?: number;
      maxAttempts?: number;
      note?: string;
    }
  | {
      event: "platform_done";
      platform: string;
      ok: true;
      postId: string;
      durationMs: number;
    }
  | {
      event: "platform_done";
      platform: string;
      ok: false;
      reason: string;
      detail?: string;
      durationMs: number;
    }
  | {
      event: "platform_skipped";
      platform: string;
      reason: "already_posted" | "not_configured" | "not_requested";
      existingId?: string;
    }
  | {
      event: "done";
      ok: boolean;
      platformPostIds: Record<string, string>;
      failures: Array<{ platform: string; reason: string; detail?: string }>;
      skipped: string[];
      totalDurationMs: number;
    };

/**
 * Callback shape passed to individual publisher functions. They invoke
 * it as they transition through internal stages (warmup, retry-N, ...).
 * The orchestrator wraps it to forward as a `platform_stage` event.
 */
export type ProgressCallback = (
  stage: PublishStage,
  opts?: { pct?: number; attempt?: number; maxAttempts?: number; note?: string },
) => void;

/** No-op progress callback for callers that don't care about progress. */
export const noopProgress: ProgressCallback = () => {};
