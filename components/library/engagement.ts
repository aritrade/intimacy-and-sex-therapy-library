"use client";

/**
 * Client-side, privacy-first engagement state for the Library.
 *
 * Everything lives in localStorage — no auth, no PII, no server tables. We keep
 * a saved-items set, per-item reading progress, and a gentle "topics explored"
 * set used for a soft "you've explored N topics" nudge. A window event lets
 * multiple mounted components stay in sync without a global store.
 */

import { useCallback, useEffect, useState } from "react";

const SAVED_KEY = "lib:saved:v1";
const PROGRESS_KEY = "lib:progress:v1";
const EXPLORED_KEY = "lib:explored:v1";
const EVENT = "lib-engagement-change";

export type Progress = {
  id: string;
  pct: number;
  at: number;
  title: string;
  href: string;
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { key } }));
  } catch {
    /* quota / private mode — degrade silently */
  }
}

/** Subscribe a component to engagement changes (cross-component + cross-tab). */
function useEngagementVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const bump = () => setV((n) => n + 1);
    window.addEventListener(EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);
  return v;
}

export function useSaved() {
  const v = useEngagementVersion();
  const [hydrated, setHydrated] = useState(false);
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(read<string[]>(SAVED_KEY, []));
    setHydrated(true);
  }, [v]);

  const toggle = useCallback((id: string) => {
    const cur = read<string[]>(SAVED_KEY, []);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur];
    write(SAVED_KEY, next);
  }, []);

  const isSaved = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, isSaved, toggle, hydrated };
}

export function recordProgress(p: Progress) {
  const cur = read<Record<string, Progress>>(PROGRESS_KEY, {});
  cur[p.id] = p;
  write(PROGRESS_KEY, cur);
}

export function useProgress() {
  const v = useEngagementVersion();
  const [hydrated, setHydrated] = useState(false);
  const [map, setMap] = useState<Record<string, Progress>>({});

  useEffect(() => {
    setMap(read<Record<string, Progress>>(PROGRESS_KEY, {}));
    setHydrated(true);
  }, [v]);

  const recent = Object.values(map)
    .filter((p) => p.pct > 2 && p.pct < 98)
    .sort((a, b) => b.at - a.at);

  return { map, recent, hydrated };
}

export function markExplored(topics: string[]) {
  if (topics.length === 0) return;
  const cur = new Set(read<string[]>(EXPLORED_KEY, []));
  for (const t of topics) cur.add(t);
  write(EXPLORED_KEY, [...cur]);
}

export function useExploredCount() {
  const v = useEngagementVersion();
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(read<string[]>(EXPLORED_KEY, []).length);
  }, [v]);
  return count;
}
