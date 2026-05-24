"use client";

import { AgeGate } from "@/components/AgeGate";
import { en } from "@/lib/i18n/en";

/**
 * Client island for the homepage. AgeGate sets the cookie via document.cookie
 * (synchronous), then we hard-reload so the server component reads it back
 * and renders the full home with VideoShelf, ContinueReadingShelf, etc.
 *
 * Reloading is intentional here — we want the server to re-fetch DB data
 * (featured videos) which only happens on a fresh request.
 */
export function AgeGateWithReload() {
  return (
    <AgeGate
      copy={en.ageGate}
      onConfirm={() => {
        window.location.reload();
      }}
    />
  );
}
