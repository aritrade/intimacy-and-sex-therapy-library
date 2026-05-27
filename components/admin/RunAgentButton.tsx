"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Agent = "discovery" | "freshness" | "link-health";

const LABELS: Record<Agent, string> = {
  discovery: "Run discovery now",
  freshness: "Run freshness now",
  "link-health": "Run link-health now",
};

/**
 * Trigger a single sync agent on demand. Used on /admin/proposals so the
 * operator doesn't have to wait until 03:00 IST to see new discovery
 * results after a config change.
 */
export function RunAgentButton({ agent }: { agent: Agent }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agents: [agent] }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        summary?: Record<string, unknown>;
        error?: string;
      };
      if (!res.ok) {
        setMsg(j.error ?? `Failed (${res.status}).`);
      } else {
        const s = j.summary?.[agent] as
          | { proposalsEmitted?: number; candidatesFound?: number; error?: string }
          | undefined;
        if (s?.error) {
          setMsg(`Errored: ${String(s.error).slice(0, 120)}`);
        } else if (s) {
          const parts: string[] = [];
          if (typeof s.candidatesFound === "number")
            parts.push(`${s.candidatesFound} candidates`);
          if (typeof s.proposalsEmitted === "number")
            parts.push(`${s.proposalsEmitted} new proposals`);
          setMsg(parts.length ? `Done · ${parts.join(", ")}` : "Done.");
          router.refresh();
        } else {
          setMsg("Done.");
          router.refresh();
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="btn-secondary text-xs"
      >
        {busy ? "Working…" : LABELS[agent]}
      </button>
      {msg && <span className="text-[11px] text-ink-500">{msg}</span>}
    </div>
  );
}
