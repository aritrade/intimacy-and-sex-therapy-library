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
 * Auth: OAuth 2 access token (YT_OAUTH_ACCESS_TOKEN). Refresh-token flow lives
 * in the wrapper — for v1 we expect operators to paste a fresh access token,
 * since auto-refresh is a moving target with Google Identity changes.
 *
 * Same hard rule as the IG publisher: refuses without env and refuses without
 * the upstream caller's guardrails.
 */

import { readFile } from "node:fs/promises";

export class YouTubePublisherRefusal extends Error {
  constructor(
    public reason: "missing_env" | "missing_file" | "upload_failed",
    public detail?: string,
  ) {
    super(`${reason}${detail ? `: ${detail}` : ""}`);
  }
}

export type YouTubeUploadInput = {
  videoPath: string;
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
  const token = process.env.YT_OAUTH_ACCESS_TOKEN;
  if (!token) {
    throw new YouTubePublisherRefusal("missing_env", "YT_OAUTH_ACCESS_TOKEN not set");
  }
  const file = await readFile(input.videoPath).catch(() => null);
  if (!file) throw new YouTubePublisherRefusal("missing_file", input.videoPath);

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
