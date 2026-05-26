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

export type PublishResult = {
  ok: boolean;
  platformPostIds: Record<string, string>;
  failures: Array<{ platform: string; reason: string; detail?: string }>;
};

export type PublishInput = {
  draftId: string;
  platforms: ("instagram" | "youtube" | "linkedin" | "twitter")[];
};

export async function publishDraft(input: PublishInput): Promise<PublishResult> {
  const draft = await db.query.contentDrafts.findFirst({
    where: eq(contentDrafts.id, input.draftId),
  });
  if (!draft) {
    return {
      ok: false,
      platformPostIds: {},
      failures: [{ platform: "all", reason: "not_found" }],
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
    };
  }

  const platformPostIds: Record<string, string> = {};
  const failures: Array<{ platform: string; reason: string; detail?: string }> = [];

  if (input.platforms.includes("instagram")) {
    try {
      const r = await publishInstagramReel({
        videoUrl: draft.videoUrl,
        caption: appendLibraryFooter(extractCaption(draft.scriptMd ?? "")),
      });
      platformPostIds.instagram = r.postId;
    } catch (e) {
      if (e instanceof PublisherRefusal) {
        failures.push({ platform: "instagram", reason: e.reason, detail: e.detail });
      } else {
        failures.push({ platform: "instagram", reason: "exception", detail: String((e as Error).message) });
      }
    }
  }
  if (input.platforms.includes("youtube")) {
    try {
      // Prefer the HTTPS Blob URL so this works on Vercel (no local FS).
      // CLI/dev callers can still pass a local path if they want.
      const r = await uploadYouTubeShort({
        videoUrl: draft.videoUrl,
        videoPath: `${process.cwd()}/public/renders/${draft.id}/video.mp4`,
        title: extractFirstLine(draft.scriptMd ?? "Untitled"),
        description: appendLibraryFooter(extractCaption(draft.scriptMd ?? "")),
      });
      platformPostIds.youtube = r.videoId;
    } catch (e) {
      if (e instanceof YouTubePublisherRefusal) {
        failures.push({ platform: "youtube", reason: e.reason, detail: e.detail });
      } else {
        failures.push({ platform: "youtube", reason: "exception", detail: String((e as Error).message) });
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

  // Only the *primary* platforms (IG / YT) determine whether the
  // overall publish flow counts as a success. LinkedIn / Twitter are
  // best-effort cross-posts; their failure shouldn't flip the draft
  // to "failed".
  const primarySuccess =
    !!platformPostIds.instagram || !!platformPostIds.youtube;
  const anySuccess = primarySuccess || Object.keys(platformPostIds).length > 0;
  await db
    .update(contentDrafts)
    .set({
      platformPostIds,
      status: anySuccess ? "posted" : "failed",
      postedAt: anySuccess ? new Date() : null,
    })
    .where(eq(contentDrafts.id, input.draftId));

  return { ok: anySuccess, platformPostIds, failures };
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
