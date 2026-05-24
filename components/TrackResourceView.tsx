"use client";

import { useEffect } from "react";

const KEY = "stl_recent_v1";
const MAX = 12;

type Stub = { id: string; slug: string; title: string; kind: string; ts: number };

/**
 * Records that the current user opened this resource. Stored locally only —
 * never sent to a server, never written to a cookie. The "Continue reading"
 * shelf on the homepage reads this back.
 *
 * We respect users who set localStorage to inaccessible (private mode etc.)
 * by simply no-oping the failure.
 */
export function TrackResourceView({
  id,
  slug,
  title,
  kind,
}: {
  id: string;
  slug: string;
  title: string;
  kind: string;
}) {
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      const list: Stub[] = raw ? JSON.parse(raw) : [];
      const filtered = list.filter((x) => x.id !== id);
      filtered.unshift({ id, slug, title, kind, ts: Date.now() });
      window.localStorage.setItem(KEY, JSON.stringify(filtered.slice(0, MAX)));
    } catch {
      // Ignore: localStorage may be disabled in private mode or by policy.
    }
  }, [id, slug, title, kind]);

  return null;
}
