/**
 * Structured logger that runs every field through `scrub`.
 *
 * Output is JSON, one line per event, suitable for Vercel's log ingestion
 * (and most third-party log sinks). Levels: debug | info | warn | error.
 *
 * Convention:
 *
 *   log.info("event_name", { foo: 1 });
 *   log.warn("rate_limit_block", { route, ip });
 *   log.error("ingest_failed", { sourceSlug, err });
 *
 * The first arg is always a short event name (snake_case). The second is an
 * optional structured context object. NEVER pass user prompts or replies as
 * the context — even though the scrubber would catch them, we want the
 * habit to be "don't try".
 *
 * Disabled in test runs by default (LOG_LEVEL=silent).
 */

import { scrubObject } from "./scrub";

type Level = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_RANK: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 99,
};

function envLevel(): Level {
  const v = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (v === "debug" || v === "info" || v === "warn" || v === "error" || v === "silent") {
    return v;
  }
  // Defaults: info in prod, debug in dev, silent in tests.
  if (process.env.NODE_ENV === "test") return "silent";
  if (process.env.NODE_ENV === "production") return "info";
  return "debug";
}

function emit(level: Level, event: string, ctx?: Record<string, unknown>) {
  if (LEVEL_RANK[level] < LEVEL_RANK[envLevel()]) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(ctx ? (scrubObject(ctx) as Record<string, unknown>) : {}),
  };
  // Use the matching console method so Vercel groups by severity.
  const fn =
    level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  try {
    fn(JSON.stringify(line));
  } catch {
    // Last-ditch: don't ever crash a request because logging blew up.
    fn(`{"ts":"${new Date().toISOString()}","level":"${level}","event":"${event}","_log_serialize_error":true}`);
  }
}

export const log = {
  debug: (event: string, ctx?: Record<string, unknown>) => emit("debug", event, ctx),
  info: (event: string, ctx?: Record<string, unknown>) => emit("info", event, ctx),
  warn: (event: string, ctx?: Record<string, unknown>) => emit("warn", event, ctx),
  error: (event: string, ctx?: Record<string, unknown>) => emit("error", event, ctx),
};
