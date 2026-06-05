"use client";

import { useEffect, useRef } from "react";
import { markExplored, recordProgress } from "./engagement";

/**
 * Records reading progress (scroll-based) and marks topics as "explored" for
 * the gentle nudge. Renders nothing. Progress is throttled and stored in
 * localStorage so "Continue reading" works across visits — no server calls.
 */
export function ReadingTracker({
  id,
  title,
  href,
  topics,
}: {
  id: string;
  title: string;
  href: string;
  topics: string[];
}) {
  const lastSaved = useRef(0);

  useEffect(() => {
    markExplored(topics);
    // Seed an initial entry so an opened-but-unscrolled item still appears.
    recordProgress({ id, title, href, pct: 3, at: Date.now() });

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const doc = document.documentElement;
        const max = doc.scrollHeight - doc.clientHeight;
        const pct = max > 0 ? Math.round((doc.scrollTop / max) * 100) : 100;
        const now = Date.now();
        if (now - lastSaved.current < 1500) return;
        lastSaved.current = now;
        recordProgress({ id, title, href, pct, at: now });
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return null;
}
