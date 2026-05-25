/**
 * YouTube Shorts publisher (YouTube Data API v3).
 *
 *   POST https://www.googleapis.com/upload/youtube/v3/videos
 *     ?part=snippet,status&uploadType=multipart
 *
 * Body is a multipart payload:
 *   part 1: application/json metadata (snippet + status)
 *   part 2: video/* binary
 *
 * Auth: OAuth 2 installed-app refresh-token flow. Operators provision
 * `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and `YOUTUBE_REFRESH_TOKEN`
 * once. The publisher exchanges the refresh token for a fresh access token
 * on every upload via `getYouTubeAccessToken` (cached in-memory between
 * calls within a process).
 *
 * Same hard rule as the IG publisher: refuses without env and refuses without
 * the upstream caller's guardrails.
 */

import { readFile } from "node:fs/promises";
import { getYouTubeAccessToken, YouTubeOAuthRefusal } from "./youtube-oauth";

export class YouTubePublisherRefusal extends Error {
  constructor(
    public reason:
      | "missing_env"
      | "missing_file"
      | "missing_source"
      | "fetch_failed"
      | "upload_failed"
      | "auth_failed",
    public detail?: string,
  ) {
    super(`${reason}${detail ? `: ${detail}` : ""}`);
  }
}

export type YouTubeUploadInput = {
  /**
   * Where to read the MP4 from. Provide either `videoUrl` (HTTPS, preferred —
   * works from any runtime including Vercel serverless) or `videoPath`
   * (local file, used when running the publisher from the dev CLI or from
   * a render job on the same machine). If both are set, `videoUrl` wins.
   */
  videoUrl?: string;
  videoPath?: string;
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string; // 22 = People & Blogs, 27 = Education
  privacyStatus?: "public" | "unlisted" | "private";
};

export type YouTubeUploadResult = {
  videoId: string;
  url: string;
};

export async function uploadYouTubeShort(input: YouTubeUploadInput): Promise<YouTubeUploadResult> {
  let token: string;
  try {
    token = await getYouTubeAccessToken();
  } catch (e) {
    if (e instanceof YouTubeOAuthRefusal) {
      throw new YouTubePublisherRefusal(
        e.reason === "missing_env" ? "missing_env" : "auth_failed",
        e.detail,
      );
    }
    throw new YouTubePublisherRefusal("auth_failed", String((e as Error).message));
  }
  // Source priority: HTTPS URL (works everywhere) → local path (CLI only).
  let file: Buffer | null = null;
  if (input.videoUrl && input.videoUrl.startsWith("https://")) {
    try {
      const res = await fetch(input.videoUrl);
      if (!res.ok) {
        throw new YouTubePublisherRefusal(
          "fetch_failed",
          `GET ${input.videoUrl} → ${res.status} ${res.statusText}`,
        );
      }
      file = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (e instanceof YouTubePublisherRefusal) throw e;
      throw new YouTubePublisherRefusal("fetch_failed", String((e as Error).message));
    }
  } else if (input.videoPath) {
    file = await readFile(input.videoPath).catch(() => null);
    if (!file) throw new YouTubePublisherRefusal("missing_file", input.videoPath);
  } else {
    throw new YouTubePublisherRefusal(
      "missing_source",
      "Provide either videoUrl (HTTPS) or videoPath (local).",
    );
  }

  const meta = {
    snippet: {
      title: input.title,
      // YouTube Shorts is signalled by aspect ratio + #Shorts in title or description.
      description: `${input.description}\n\n#Shorts`,
      tags: input.tags ?? ["sex therapy", "intimacy", "education"],
      categoryId: input.categoryId ?? "27",
      defaultLanguage: "en",
      defaultAudioLanguage: "en",
    },
    status: {
      privacyStatus: input.privacyStatus ?? "private",
      selfDeclaredMadeForKids: false,
    },
  };

  // Build a multipart/related body manually so we don't pull in another dep.
  const boundary = `----stl-${Math.random().toString(36).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`,
    "utf-8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf-8");
  const body = Buffer.concat([head, file, tail]);

  const res = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    },
  );
  const j = (await res.json()) as { id?: string; error?: unknown };
  if (!res.ok || !j.id) {
    throw new YouTubePublisherRefusal("upload_failed", JSON.stringify(j));
  }
  return { videoId: j.id, url: `https://www.youtube.com/shorts/${j.id}` };
}
