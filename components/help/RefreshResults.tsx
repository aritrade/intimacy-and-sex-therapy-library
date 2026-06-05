"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type RefreshParams = {
  kind: "clinicians" | "communities";
  country: string;
  state?: string;
  locality?: string;
  specialty?: string;
  topic?: string;
  scope?: string;
  affirming?: string;
};

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function RefreshResults({
  params,
  fetchedAtMs,
  stale,
}: {
  params: RefreshParams;
  fetchedAtMs: number | null;
  stale: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setErr(false);
    try {
      const res = await fetch("/api/help/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        setErr(true);
        return;
      }
      // Re-render the server component from the freshly-updated cache.
      router.refresh();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {fetchedAtMs && (
        <span className="text-xs text-ink-400">
          {stale ? "Cached" : "Updated"} {relativeTime(fetchedAtMs)}
        </span>
      )}
      <button
        type="button"
        onClick={refresh}
        disabled={busy}
        className="btn-secondary text-xs disabled:opacity-50"
        title="Fetch the latest results from the web now"
      >
        {busy ? "Refreshing…" : "Refresh"}
      </button>
      {err && <span className="text-xs text-coral">Couldn&apos;t refresh — try again shortly.</span>}
    </div>
  );
}
