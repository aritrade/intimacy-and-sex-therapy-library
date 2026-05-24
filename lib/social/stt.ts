/**
 * Speech-to-text + caption alignment.
 *
 * Calls OpenAI's whisper-1 verbose transcription endpoint, which returns
 * word- and segment-level timestamps. We use it to:
 *   - Verify the rendered voiceover actually says what the script said
 *     (drift check). Drift > 0.4 normalised edit distance flags the draft for
 *     re-render.
 *   - Build SRT for the on-screen captions baked into the Remotion comp and
 *     for the public caption file.
 *
 * Returns null when OPENAI_API_KEY is unset. The render pipeline degrades to
 * "no captions" rather than failing.
 */

export type WhisperWord = { word: string; start: number; end: number };
export type WhisperSegment = { id: number; start: number; end: number; text: string };
export type WhisperResult = {
  text: string;
  language: string;
  words: WhisperWord[];
  segments: WhisperSegment[];
};

export async function transcribe(
  audio: Buffer,
  mime: "audio/mpeg" | "audio/wav",
): Promise<WhisperResult | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const fd = new FormData();
  // Web standard FormData; Node 20+ supports Blob / File.
  const blob = new Blob([new Uint8Array(audio)], { type: mime });
  fd.append("file", blob, mime === "audio/mpeg" ? "audio.mp3" : "audio.wav");
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "word");
  fd.append("timestamp_granularities[]", "segment");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: fd,
  });
  if (!res.ok) {
    throw new Error(`Whisper ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as {
    text: string;
    language: string;
    words?: WhisperWord[];
    segments?: WhisperSegment[];
  };
  return {
    text: data.text,
    language: data.language,
    words: data.words ?? [],
    segments: data.segments ?? [],
  };
}

/** Build an SRT file from word-level Whisper output, grouped to ~4 words/cue. */
export function wordsToSrt(words: WhisperWord[]): string {
  if (words.length === 0) return "";
  const groups: WhisperWord[][] = [];
  let cur: WhisperWord[] = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= 4) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length) groups.push(cur);

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s - Math.floor(s)) * 1000);
    return `${pad(h, 2)}:${pad(m, 2)}:${pad(sec, 2)},${pad(ms, 3)}`;
  };

  return groups
    .map((g, i) => {
      const start = g[0].start;
      const end = g[g.length - 1].end;
      const text = g.map((w) => w.word.trim()).join(" ").trim();
      return `${i + 1}\n${fmt(start)} --> ${fmt(end)}\n${text}\n`;
    })
    .join("\n");
}

/** Cheap normalised drift between two strings (Levenshtein/maxLen). */
export function drift(a: string, b: string): number {
  const A = a.toLowerCase().replace(/\s+/g, " ").trim();
  const B = b.toLowerCase().replace(/\s+/g, " ").trim();
  if (A === B) return 0;
  const m = A.length;
  const n = B.length;
  if (m === 0 || n === 0) return 1;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n] / Math.max(m, n);
}

function pad(n: number, len: number) {
  return String(n).padStart(len, "0");
}
