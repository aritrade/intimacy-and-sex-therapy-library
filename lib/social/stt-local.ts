/**
 * Local "STT" — caption generation without actually running speech
 * recognition.
 *
 * Why we can skip the real STT:
 *   - The voiceover was synthesised from a script we wrote. We know
 *     the exact text. The only thing we need is timing.
 *   - The TTS provider returns total duration. We distribute the
 *     duration across words proportional to their length, then group
 *     into ~3-4 word cues.
 *
 * This is good enough for short-form vertical video where viewers see
 * 1-3 cues at a time. For long-form essays we still recommend a real
 * STT pass to catch TTS pronunciation errors; that path uses
 * `lib/social/stt.ts` (OpenAI Whisper) when OPENAI_API_KEY is set.
 *
 * The function returns the same SRT shape as `wordsToSrt` so the
 * render pipeline can use either source interchangeably.
 */

export type SyntheticWord = { word: string; start: number; end: number };

/**
 * Build SRT captions from a script (the source of truth) and the
 * total spoken duration. We weight per-word time by character count
 * so longer words get proportionally more screen time.
 */
export function scriptToSrt(scriptText: string, totalSeconds: number): string {
  const words = scriptText
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0 || totalSeconds <= 0) return "";

  // Allocate time per word weighted by length (min 1 char to avoid div-by-zero).
  const totalChars = words.reduce((acc, w) => acc + Math.max(1, w.length), 0);
  const secondsPerChar = totalSeconds / totalChars;

  let cursor = 0;
  const timed: SyntheticWord[] = words.map((w) => {
    const dur = Math.max(0.15, w.length * secondsPerChar);
    const start = cursor;
    const end = cursor + dur;
    cursor = end;
    return { word: w, start, end };
  });

  // Group into cues of 3-4 words (sex-health captions read better short).
  const groups: SyntheticWord[][] = [];
  let cur: SyntheticWord[] = [];
  for (const w of timed) {
    cur.push(w);
    const groupChars = cur.reduce((a, b) => a + b.word.length, 0);
    // Break when cue gets long OR ends with sentence punctuation.
    if (cur.length >= 4 || groupChars >= 28 || /[.?!]$/.test(w.word)) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length) groups.push(cur);

  return groups
    .map((g, i) => {
      const start = g[0].start;
      const end = g[g.length - 1].end;
      const text = g.map((w) => w.word).join(" ").trim();
      return `${i + 1}\n${fmt(start)} --> ${fmt(end)}\n${text}\n`;
    })
    .join("\n");
}

function fmt(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(sec, 2)},${pad(ms, 3)}`;
}
function pad(n: number, len: number): string {
  return String(n).padStart(len, "0");
}
