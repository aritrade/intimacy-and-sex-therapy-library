/**
 * Shared publish-to-platforms logic.
 *
 * Used by:
 *   - /api/admin/drafts/[id]/publish — human "publish now" button
 *   - /api/cron/publish-due           — hourly GH Action that posts
 *                                       drafts the human has scheduled
 *
 * The route handlers wrap this with the appropriate auth gate (admin
 * session for the manual route, CRON_SECRET for the cron route) and a
 * status-machine guard.
 *
 * NOTHING in this module makes the publish/no-publish call. Callers
 * must already know the draft is approved and the human wants it out.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts } from "@/lib/db/schema";
import { publishInstagramReel, PublisherRefusal } from "@/lib/social/publishers/instagram";
import { uploadYouTubeShort, YouTubePublisherRefusal } from "@/lib/social/publishers/youtube";
import {
  publishFacebookReel,
  FacebookPublisherRefusal,
  isFacebookConfigured,
} from "@/lib/social/publishers/facebook";
import {
  publishLinkedInPost,
  LinkedInPublisherRefusal,
  isLinkedInConfigured,
} from "@/lib/social/publishers/linkedin";
import {
  publishTweet,
  TwitterPublisherRefusal,
  isTwitterConfigured,
} from "@/lib/social/publishers/twitter";
import { BRAND_COPY } from "@/lib/brand/tokens";
import type { ProgressEvent } from "./publish-progress";

export type PublishResult = {
  ok: boolean;
  platformPostIds: Record<string, string>;
  failures: Array<{ platform: string; reason: string; detail?: string }>;
  /**
   * Platforms the caller asked us to publish to but were already
   * present in the draft's platformPostIds — we no-op those rather
   * than double-post. Empty for fresh publishes; non-empty when
   * the operator re-clicks publish after a partial-success.
   */
  skipped: string[];
};

export type Platform =
  | "instagram"
  | "youtube"
  | "facebook"
  | "linkedin"
  | "twitter";

export type PublishInput = {
  draftId: string;
  platforms: Platform[];
  /**
   * Optional event sink. Called as the publish flow transitions between
   * platforms and stages. Set by the streaming publish endpoint to
   * forward events to the client over NDJSON; non-streaming callers
   * (existing cron + JSON API) pass nothing and the events are dropped.
   */
  onEvent?: (event: ProgressEvent) => void;
};

export async function publishDraft(input: PublishInput): Promise<PublishResult> {
  const onEvent = input.onEvent ?? (() => {});
  const runStart = Date.now();
  const draft = await db.query.contentDrafts.findFirst({
    where: eq(contentDrafts.id, input.draftId),
  });
  if (!draft) {
    return {
      ok: false,
      platformPostIds: {},
      failures: [{ platform: "all", reason: "not_found" }],
      skipped: [],
    };
  }
  if (!draft.videoUrl || !draft.videoUrl.startsWith("https://")) {
    return {
      ok: false,
      platformPostIds: {},
      failures: [
        {
          platform: "all",
          reason: "missing_https_video_url",
          detail:
            "Publishing requires a public HTTPS video URL. Configure BLOB_READ_WRITE_TOKEN and re-render.",
        },
      ],
      skipped: [],
    };
  }

  // Start from whatever's already been posted. A partial-success run
  // (e.g. YT + FB shipped, IG failed) leaves the row at status=posted
  // with the two ids saved; this re-publish should ADD the missing
  // platform, not wipe the prior successes. Skipping platforms already
  // present also makes the API naturally idempotent — pointing the
  // button at the same draft twice doesn't double-post.
  const existing = (draft.platformPostIds as Record<string, string> | null) ?? {};
  const platformPostIds: Record<string, string> = { ...existing };
  const skipped: string[] = [];
  const failures: Array<{ platform: string; reason: string; detail?: string }> = [];

  onEvent({ event: "start", platforms: input.platforms, draftId: input.draftId });

  // Emit `start` for each primary so the UI can draw a placeholder row
  // even before that platform begins (gives the user the full picture
  // up front rather than rows appearing one at a time).
  for (const p of ["instagram", "youtube", "facebook"] as const) {
    if (input.platforms.includes(p)) {
      if (existing[p]) {
        onEvent({
          event: "platform_skipped",
          platform: p,
          reason: "already_posted",
          existingId: existing[p],
        });
        skipped.push(p);
      } else {
        onEvent({ event: "platform_start", platform: p });
      }
    }
  }

  if (input.platforms.includes("instagram") && !existing.instagram) {
    const t0 = Date.now();
    try {
      const r = await publishInstagramReel({
        videoUrl: draft.videoUrl,
        caption: appendLibraryFooter(extractCaption(draft.scriptMd ?? "")),
        onProgress: (stage, opts) =>
          onEvent({ event: "platform_stage", platform: "instagram", stage, pct: opts?.pct ?? 0, attempt: opts?.attempt, maxAttempts: opts?.maxAttempts, note: opts?.note }),
      });
      platformPostIds.instagram = r.postId;
      onEvent({ event: "platform_done", platform: "instagram", ok: true, postId: r.postId, durationMs: Date.now() - t0 });
    } catch (e) {
      const failure =
        e instanceof PublisherRefusal
          ? { platform: "instagram", reason: e.reason, detail: e.detail }
          : { platform: "instagram", reason: "exception", detail: String((e as Error).message) };
      failures.push(failure);
      onEvent({ event: "platform_done", platform: "instagram", ok: false, reason: failure.reason, detail: failure.detail, durationMs: Date.now() - t0 });
    }
  }
  if (input.platforms.includes("youtube") && !existing.youtube) {
    const t0 = Date.now();
    try {
      // Prefer the HTTPS Blob URL so this works on Vercel (no local FS).
      // CLI/dev callers can still pass a local path if they want.
      const r = await uploadYouTubeShort({
        videoUrl: draft.videoUrl,
        videoPath: `${process.cwd()}/public/renders/${draft.id}/video.mp4`,
        title: extractFirstLine(draft.scriptMd ?? "Untitled"),
        description: appendLibraryFooter(extractCaption(draft.scriptMd ?? "")),
        onProgress: (stage, opts) =>
          onEvent({ event: "platform_stage", platform: "youtube", stage, pct: opts?.pct ?? 0, attempt: opts?.attempt, maxAttempts: opts?.maxAttempts, note: opts?.note }),
      });
      platformPostIds.youtube = r.videoId;
      onEvent({ event: "platform_done", platform: "youtube", ok: true, postId: r.videoId, durationMs: Date.now() - t0 });
    } catch (e) {
      const failure =
        e instanceof YouTubePublisherRefusal
          ? { platform: "youtube", reason: e.reason, detail: e.detail }
          : { platform: "youtube", reason: "exception", detail: String((e as Error).message) };
      failures.push(failure);
      onEvent({ event: "platform_done", platform: "youtube", ok: false, reason: failure.reason, detail: failure.detail, durationMs: Date.now() - t0 });
    }
  }
  if (input.platforms.includes("facebook") && !existing.facebook) {
    if (!isFacebookConfigured()) {
      const failure = { platform: "facebook", reason: "missing_env", detail: "META_FACEBOOK_PAGE_ID / META_GRAPH_ACCESS_TOKEN not set" };
      failures.push(failure);
      onEvent({ event: "platform_done", platform: "facebook", ok: false, reason: failure.reason, detail: failure.detail, durationMs: 0 });
    } else {
      const t0 = Date.now();
      try {
        const r = await publishFacebookReel({
          videoUrl: draft.videoUrl,
          description: appendLibraryFooter(extractCaption(draft.scriptMd ?? "")),
          onProgress: (stage, opts) =>
            onEvent({ event: "platform_stage", platform: "facebook", stage, pct: opts?.pct ?? 0, attempt: opts?.attempt, maxAttempts: opts?.maxAttempts, note: opts?.note }),
        });
        platformPostIds.facebook = r.postId;
        onEvent({ event: "platform_done", platform: "facebook", ok: true, postId: r.postId, durationMs: Date.now() - t0 });
      } catch (e) {
        const failure =
          e instanceof FacebookPublisherRefusal
            ? { platform: "facebook", reason: e.reason, detail: e.detail }
            : { platform: "facebook", reason: "exception", detail: String((e as Error).message) };
        failures.push(failure);
        onEvent({ event: "platform_done", platform: "facebook", ok: false, reason: failure.reason, detail: failure.detail, durationMs: Date.now() - t0 });
      }
    }
  }

  // LinkedIn + Twitter cross-post the same script as a text update.
  // We never error if these aren't configured — they're additive.
  const blogUrl = blogUrlForDraft(draft.scriptMd ?? "");
  if (input.platforms.includes("linkedin") && isLinkedInConfigured()) {
    try {
      const text = composeLinkedInText(draft.scriptMd ?? "");
      const r = await publishLinkedInPost({ text, shareUrl: blogUrl });
      platformPostIds.linkedin = r.postId;
    } catch (e) {
      if (e instanceof LinkedInPublisherRefusal) {
        failures.push({ platform: "linkedin", reason: e.reason, detail: e.detail });
      } else {
        failures.push({ platform: "linkedin", reason: "exception", detail: String((e as Error).message) });
      }
    }
  }
  if (input.platforms.includes("twitter") && isTwitterConfigured()) {
    try {
      const text = composeTweet(draft.scriptMd ?? "");
      const r = await publishTweet({ text, shareUrl: blogUrl });
      platformPostIds.twitter = r.postId;
    } catch (e) {
      if (e instanceof TwitterPublisherRefusal) {
        failures.push({ platform: "twitter", reason: e.reason, detail: e.detail });
      } else {
        failures.push({ platform: "twitter", reason: "exception", detail: String((e as Error).message) });
      }
    }
  }

  // Status machine for the row, accounting for the MERGED state
  // (prior posts + this run):
  //   - Any primary post (IG / YT / FB) in the merged map -> "posted"
  //   - Otherwise, if this run produced no posts at all     -> "failed"
  //   - postedAt: set on first transition to "posted", preserved on
  //     subsequent partial-recovery runs (don't clobber the original
  //     publish time when re-running just to fill in a missing IG).
  const primarySuccess =
    !!platformPostIds.instagram ||
    !!platformPostIds.youtube ||
    !!platformPostIds.facebook;
  const anySuccess = primarySuccess || Object.keys(platformPostIds).length > 0;
  const nextStatus = anySuccess ? "posted" : "failed";
  const nextPostedAt =
    anySuccess && !draft.postedAt ? new Date() : (draft.postedAt ?? null);

  await db
    .update(contentDrafts)
    .set({
      platformPostIds,
      status: nextStatus,
      postedAt: nextPostedAt,
    })
    .where(eq(contentDrafts.id, input.draftId));

  // Success of THIS call is what the API contract reports. If this
  // run attempted IG-only and IG failed, we report ok=false even
  // though the merged draft is still "posted" — the caller asked
  // about this attempt, not the overall draft state. Skipped
  // platforms (already-posted) count as no-op success.
  const thisRunPosted = input.platforms.filter(
    (p) =>
      platformPostIds[p] !== undefined && // present in merged map
      !skipped.includes(p) && // not because we skipped it
      !(p in existing), // not because it was there before
  );
  const thisRunOk =
    failures.length === 0 ||
    thisRunPosted.length > 0 ||
    skipped.length === input.platforms.length;

  onEvent({
    event: "done",
    ok: thisRunOk,
    platformPostIds,
    failures,
    skipped,
    totalDurationMs: Date.now() - runStart,
  });

  return { ok: thisRunOk, platformPostIds, failures, skipped };
}

export function extractCaption(md: string): string {
  const m = md.match(/# Caption\n([\s\S]*?)(?:\n# |$)/);
  return m?.[1].trim() ?? md.slice(0, 1500);
}
export function extractFirstLine(md: string): string {
  const m = md.match(/# Hook\n(.*)/);
  return (m?.[1] ?? "Intimacy & Sex Therapy Library short").slice(0, 100);
}

/**
 * Standard brand footer appended to every IG caption + YT description.
 * Idempotent: if the text already mentions our domain (some captions
 * include a deep-link to a specific blog topic, which already satisfies
 * the "library link" requirement), we don't double up.
 *
 * Kept here (not in BRAND_COPY) because it's prose, not a token. If
 * the wording ever needs A/B testing we can move it to a setting.
 */
export const LIBRARY_FOOTER = `Visit our library at ${BRAND_COPY.url}/ for more information`;

export function appendLibraryFooter(text: string): string {
  const cleaned = text.trimEnd();
  if (cleaned.includes(BRAND_COPY.domain)) return cleaned;
  return `${cleaned}\n\n${LIBRARY_FOOTER}`;
}

/**
 * LinkedIn text: hook + first body scene + CTA, plus a soft mention
 * of the library. ~600 chars sweet spot.
 */
function composeLinkedInText(md: string): string {
  const hook = extractFirstLine(md);
  const bodyFirst = (md.match(/^1\.\s*\(\d+(?:\.\d+)?s\)\s*(.+)$/m) ?? [])[1] ?? "";
  const cta = (md.match(/# CTA\n(.+)/) ?? [])[1] ?? "";
  const parts = [hook, bodyFirst, cta].filter(Boolean);
  return [
    parts.join("\n\n"),
    "",
    "—",
    `${BRAND_COPY.fullName} — evidence-grounded sex therapy resources.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Tweet text: hook only (with a colon if needed). The shareUrl is
 * appended by the publisher; we leave it space.
 */
function composeTweet(md: string): string {
  const hook = extractFirstLine(md);
  return hook;
}

function blogUrlForDraft(md: string): string | undefined {
  // If the script's caption mentions a topic slug we can deep-link
  // to /blog/topic-<slug> on the website. Fallback: site root.
  const caption = (md.match(/# Caption\n([\s\S]*?)(?:\n# |$)/) ?? [])[1] ?? "";
  const m = caption.match(/intimacy-and-sex-therapy-library\.vercel\.app(\/[\w\-/]*)?/);
  if (m) return `https://intimacy-and-sex-therapy-library.vercel.app${m[1] ?? ""}`;
  return BRAND_COPY.url;
}
