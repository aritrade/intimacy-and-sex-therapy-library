"use client";

import { useEffect, useState } from "react";

/**
 * Browser-only store of completed assessment results, so the Screening
 * Companion can pull them together. We store ONLY the scored summary — never
 * the raw item answers — mirroring the privacy posture of the rest of the app.
 */

const KEY = "assessment-results-v1";

export type StoredResult = {
  instrumentId: string;
  name: string;
  shortName: string;
  rawScore: number;
  maxScore: number;
  scoreSuffix?: string;
  severityLabel: string;
  flag: "safe" | "monitor" | "clinician_recommended" | "urgent";
  crisisSignal: boolean;
  at: number;
  /** Epoch ms when this result was persisted to the signed-in account. */
  syncedAt?: number;
};

function read(): StoredResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredResult[]) : [];
  } catch {
    return [];
  }
}

function write(list: StoredResult[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event("assessment-results-changed"));
  } catch {
    /* storage disabled — degrade silently */
  }
}

/** Upsert a result by instrument id, keeping the most recent run. */
export function recordResult(r: StoredResult) {
  const list = read().filter((x) => x.instrumentId !== r.instrumentId);
  list.push(r);
  write(list);
}

export function clearResults() {
  write([]);
}

/** Results not yet persisted to a signed-in account. */
export function unsyncedResults(): StoredResult[] {
  return read().filter((r) => !r.syncedAt);
}

/** Mark the given results (by instrumentId + at) as synced to the account. */
export function markSynced(keys: Array<{ instrumentId: string; at: number }>) {
  if (keys.length === 0) return;
  const match = new Set(keys.map((k) => `${k.instrumentId}:${k.at}`));
  const list = read().map((r) =>
    match.has(`${r.instrumentId}:${r.at}`) ? { ...r, syncedAt: Date.now() } : r,
  );
  write(list);
}

export function useStoredResults(): StoredResult[] {
  const [list, setList] = useState<StoredResult[]>([]);
  useEffect(() => {
    const refresh = () => setList(read());
    refresh();
    window.addEventListener("assessment-results-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("assessment-results-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return list;
}
