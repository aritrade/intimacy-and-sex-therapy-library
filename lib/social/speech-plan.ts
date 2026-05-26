/**
 * Convert a GeneratedScript into an ordered list of SpeechSegments —
 * each segment is a contiguous block of text to send to TTS, plus a
 * silence-after duration in milliseconds.
 *
 * Why this exists instead of inline SSML <break> tags:
 *   Microsoft Edge's free Read Aloud WSS endpoint (the one msedge-tts
 *   uses) rejects every pause SSML element we tried — <break>,
 *   <mstts:silence>, and even <break> outside <prosody>. The endpoint
 *   silently returns zero audio bytes when any of those appears. So we
 *   can't rely on inline pause tags for the free path.
 *
 *   Instead, we segment the script up front, send each segment as a
 *   separate Edge call (plain text + global prosody, which DOES work),
 *   and stitch them back together with ffmpeg-generated silence between
 *   segments. This gives us byte-level control over inter-scene pauses
 *   while preserving Edge's natural intra-sentence prosody (which is
 *   already very good — periods get ~250ms, commas get ~150ms).
 *
 * ElevenLabs (the premium fallback) DOES respect inline <break>, so
 *   when TTS_PROVIDER=elevenlabs we collapse the segments into one
 *   string with <break time="..."/> tags between them. Same pause
 *   budget either way.
 *
 * Pause budget (from NARRATOR.tts.pauses):
 *   - between hook ↔ first body, last body ↔ cta : transitionMs (450)
 *   - between adjacent body scenes                : sceneMs (550)
 *   - within a scene (after sentence/clause)      : NOT inserted here.
 *     Edge handles those automatically via punctuation prosody. The
 *     within-scene targets in NARRATOR.tts.pauses are documentation
 *     only on this path; we'd re-instate them if we ever switched to
 *     a TTS that doesn't auto-pause on punctuation.
 */

import { NARRATOR } from "../brand/persona";
import type { GeneratedScript } from "./script-generator";

export type SpeechSegment = {
  /** Plain text to synthesise. Apostrophes and em-dashes stay literal. */
  text: string;
  /** Silence to insert AFTER this segment, in milliseconds. 0 = no gap. */
  silenceMsAfter: number;
  /** Diagnostic label, used in logs. */
  kind: "hook" | "body" | "cta";
};

/** Build the ordered segment list for a reel script. */
export function buildSpeechPlan(script: GeneratedScript): SpeechSegment[] {
  const { transitionMs, sceneMs } = NARRATOR.tts.pauses;
  const segments: SpeechSegment[] = [];

  if (script.hook.trim()) {
    segments.push({
      kind: "hook",
      text: cleanScene(script.hook),
      silenceMsAfter: script.body.length > 0 ? transitionMs : 0,
    });
  }

  script.body.forEach((scene, i) => {
    const isLast = i === script.body.length - 1;
    segments.push({
      kind: "body",
      text: cleanScene(scene.text),
      silenceMsAfter: isLast
        ? script.cta.trim()
          ? transitionMs
          : 0
        : sceneMs,
    });
  });

  if (script.cta.trim()) {
    segments.push({
      kind: "cta",
      text: cleanScene(script.cta),
      // Trailing breathing room after the final word — guarantees the
      // CTA is fully spoken regardless of platform / player truncation
      // at the very end of the track. See NARRATOR.tts.pauses.tailMs.
      silenceMsAfter: NARRATOR.tts.pauses.tailMs,
    });
  }

  return segments;
}

/**
 * Light pre-clean of a scene's text so Edge's natural prosody behaves:
 *   - collapse whitespace runs (LLM output sometimes has \n inside scenes)
 *   - guarantee terminal punctuation so Edge's sentence-final lengthening
 *     fires (otherwise the segment ends abruptly mid-thought)
 *   - normalise the spaced-hyphen pseudo-em-dash to a real em-dash so
 *     Edge gives it the longer pause it deserves
 *
 * NOTE: do NOT escape XML here. These segments are passed as plain text
 * arguments to Edge / Sarvam, both of which take literal strings. The
 * ElevenLabs path also takes literal text (with optional SSML <break>
 * added by the orchestrator in tts.ts).
 */
function cleanScene(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim();
  t = t.replace(/\s-\s/g, " — ");
  if (!/[.!?…]$/.test(t)) t = `${t}.`;
  return t;
}

/**
 * Render a speech plan back to plain text (segments joined with single
 * spaces, no SSML, no silence markers). Used for Whisper drift comparison
 * and the synthetic SRT fallback when Whisper is unavailable.
 */
export function speechPlanToPlainText(segments: SpeechSegment[]): string {
  return segments
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Render a speech plan as a single ElevenLabs-compatible body — joins
 * each segment's text with an inline <break time="…ms"/> tag of the
 * segment's `silenceMsAfter`. ElevenLabs honours these tags natively.
 */
export function speechPlanToElevenLabsText(segments: SpeechSegment[]): string {
  const parts: string[] = [];
  segments.forEach((s, i) => {
    parts.push(s.text);
    if (s.silenceMsAfter > 0 && i < segments.length - 1) {
      parts.push(`<break time="${s.silenceMsAfter}ms"/>`);
    }
  });
  return parts.join(" ");
}
