"use client";

import { useEffect, useRef } from "react";
import { unsyncedResults, markSynced, type StoredResult } from "./results-store";

/**
 * Single writer that persists browser-held assessment results to the signed-in
 * account. Mounted once globally.
 *
 * It carries no auth state: it simply replays unsynced results to
 * /api/account/assessment-results, which requires auth and returns 401 for
 * anonymous visitors (in which case we leave the results unsynced for later).
 * This keeps the root layout statically renderable. The endpoint is idempotent
 * on (user, instrument, takenAt), so replaying is always safe.
 *
 * It runs on mount and whenever the store changes (so a freshly-scored
 * assessment is persisted immediately for signed-in users).
 */
export function ResultsSync() {
  const running = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      if (running.current) return;
      const pending = unsyncedResults();
      if (pending.length === 0) return;
      running.current = true;
      try {
        const done: Array<{ instrumentId: string; at: number }> = [];
        for (const r of pending) {
          if (cancelled) break;
          const ok = await postOne(r);
          if (ok === "unauthorized") break; // anonymous — try again next load
          if (ok === "ok") done.push({ instrumentId: r.instrumentId, at: r.at });
        }
        if (!cancelled && done.length > 0) markSynced(done);
      } finally {
        running.current = false;
      }
    }

    void sync();
    window.addEventListener("assessment-results-changed", sync);
    return () => {
      cancelled = true;
      window.removeEventListener("assessment-results-changed", sync);
    };
  }, []);

  return null;
}

async function postOne(r: StoredResult): Promise<"ok" | "unauthorized" | "error"> {
  try {
    const res = await fetch("/api/account/assessment-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instrumentId: r.instrumentId,
        rawScore: Math.round(r.rawScore),
        severity: r.severityLabel.slice(0, 64),
        flags: [r.flag, r.crisisSignal ? "urgent" : null].filter(Boolean),
        takenAt: new Date(r.at).toISOString(),
      }),
    });
    if (res.status === 401) return "unauthorized";
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}
