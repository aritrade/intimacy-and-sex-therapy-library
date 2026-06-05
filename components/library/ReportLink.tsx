"use client";

import { useState } from "react";

/**
 * Lightweight "Report" affordance for a Discover source. Reuses the Find Help
 * flag endpoint (help_result_flags) so admins moderate both in one place.
 */
export function ReportLink({ refId, cacheKey }: { refId: string; cacheKey?: string }) {
  const [state, setState] = useState<"idle" | "sent">("idle");

  async function report() {
    if (state === "sent") return;
    try {
      await fetch("/api/help/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: refId, cacheKey, reason: "discover" }),
      });
    } catch {
      /* fails soft */
    }
    setState("sent");
  }

  return (
    <button
      type="button"
      onClick={report}
      disabled={state === "sent"}
      className="text-xs text-ink-400 underline-offset-2 hover:text-coral hover:underline disabled:no-underline"
    >
      {state === "sent" ? "Reported — thank you" : "Report"}
    </button>
  );
}
