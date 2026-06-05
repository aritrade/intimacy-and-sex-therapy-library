"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Fires a fire-and-forget beacon to /api/track on every pathname change so
 * the in-app analytics log (page_views) gets one row per view. The server
 * derives country/device from Vercel edge headers — this component sends only
 * the (PII-free) path + referrer. Admin paths are skipped.
 */
export function VisitTracker() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/admin")) return;
    // Guard against double-fire in React strict mode / rapid re-renders.
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;

    const payload = JSON.stringify({
      path: pathname,
      ref: document.referrer || undefined,
    });

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }));
      } else {
        void fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        });
      }
    } catch {
      // Analytics must never throw in the render path.
    }
  }, [pathname]);

  return null;
}
