/**
 * PII / content scrubber for application logs.
 *
 * The platform's compliance posture is "no log line ever contains a user
 * prompt, chatbot reply, vault transcript, assessment answer, or PII".
 * This module is the single chokepoint that enforces that on the way out.
 *
 * Two modes:
 *
 *   - scrubString(s)  — replaces emails, phone numbers, common Indian/US
 *     identifiers, and very long free-text blocks with placeholders.
 *
 *   - scrubObject(o)  — deep-copies an object and:
 *       * Drops any field whose key matches DROP_KEYS (e.g. `messages`,
 *         `prompt`, `body`, `transcript`, `answers`).
 *       * Replaces any string value with scrubString().
 *       * Hashes any UUIDs/email-like fields under HASH_KEYS so we keep
 *         correlation but lose content.
 *
 *   - hashForCorrelation(s)  — sha256 hex prefix for "same user across
 *     log lines" correlation without leaking the underlying value.
 *
 * Always lossy; never reversible. If you need the real value, you have a
 * bug — the production log is not the right place to read it.
 */

import { createHash } from "node:crypto";

/** Keys that must NEVER appear in logs, regardless of nesting. */
const DROP_KEYS = new Set([
  // Free-text content from the user or model
  "messages", "message", "content", "prompt", "system", "transcript",
  "body", "text", "input", "output", "response", "answer", "answers",
  "completion", "delta", "draft", "captions", "captionsSrt",

  // Vault material (must never be logged)
  "ciphertext", "iv", "salt", "passphrase", "key",

  // Auth / session secrets
  "password", "token", "access_token", "refresh_token", "id_token",
  "session_state", "sessionToken", "csrfToken", "secret",
]);

/** Keys whose value is correlated (kept, but hashed). */
const HASH_KEYS = new Set([
  "userId", "user_id", "sub",
  "email", "emailVerified",
  "phone", "phoneNumber",
  "ip", "x-forwarded-for", "remoteAddress", "fingerprint",
]);

const REDACTED_LONG_TEXT_THRESHOLD = 240;

// Order matters: more specific patterns must run before greedy ones
// (phone, card) so we don't lose Aadhaar / PAN / API-key signals to a
// generic digit run.
const PATTERNS: Array<[RegExp, string]> = [
  // Email
  [/[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi, "[email]"],
  // OAuth-style bearer tokens
  [/\beyJ[A-Za-z0-9_-]{20,}\b/g, "[jwt]"],
  // Anthropic / OpenAI style API keys (run before phone — they contain digits)
  [/\b(?:sk|ant)-[A-Za-z0-9_-]{20,}\b/g, "[api-key]"],
  // PAN (5 letters, 4 digits, 1 letter)
  [/\b[A-Z]{5}\d{4}[A-Z]\b/g, "[pan]"],
  // Aadhaar (12 digits, possibly grouped 4-4-4)
  [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[aadhaar]"],
  // SSN (US, 3-2-4)
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[ssn]"],
  // Credit card-ish (13-19 digits, optional spaces/dashes)
  [/\b(?:\d[ -]?){13,19}\b/g, "[card]"],
  // Phone numbers (loose: 7+ digits with optional separators / leading +)
  // Run last among numerics so it doesn't swallow Aadhaar / PAN / API keys.
  [/(?:\+?\d[\d\s\-().]{7,}\d)/g, "[phone]"],
];

/**
 * Replaces obvious PII patterns in a string. Long strings get truncated to
 * a hash prefix so logs stay bounded.
 */
export function scrubString(input: string): string {
  if (typeof input !== "string") return String(input);
  let s = input;
  for (const [re, replacement] of PATTERNS) s = s.replace(re, replacement);
  if (s.length > REDACTED_LONG_TEXT_THRESHOLD) {
    return `[truncated len=${input.length} sha256=${shortHash(input)}]`;
  }
  return s;
}

/**
 * Deep-scrubs an object for safe logging.
 *
 * Cycles are detected via a Set of seen objects; cyclic refs become "[cycle]".
 */
export function scrubObject(value: unknown): unknown {
  return walk(value, new WeakSet());
}

function walk(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubString(value.message),
      stack: value.stack ? scrubString(value.stack) : undefined,
    };
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) return "[cycle]";
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value.map((v) => walk(v, seen));
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if (DROP_KEYS.has(k) || DROP_KEYS.has(lk)) {
        out[k] = "[redacted]";
        continue;
      }
      if (HASH_KEYS.has(k) || HASH_KEYS.has(lk)) {
        out[k] = typeof v === "string" ? `sha256:${shortHash(v)}` : "[hashed]";
        continue;
      }
      out[k] = walk(v, seen);
    }
    return out;
  }

  return String(value);
}

/** sha256(value) → first 16 hex chars. Use to correlate without leaking. */
export function hashForCorrelation(value: string): string {
  return shortHash(value);
}

function shortHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}
