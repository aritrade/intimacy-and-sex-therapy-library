"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PollNowButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function pollNow() {
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const res = await fetch("/api/admin/post-metrics/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(j?.error ?? `Poll failed (${res.status})`);
        return;
      }
      const s = j.summary as {
        scanned: number;
        updated: number;
        takedowns: number;
        failures: { length: number };
      };
      setSummary(
        `Scanned ${s.scanned}, updated ${s.updated}, takedowns ${s.takedowns}, failures ${s.failures.length}.`,
      );
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={pollNow} disabled={busy} className="btn-secondary text-xs">
        {busy ? "Polling…" : "Poll metrics now"}
      </button>
      {summary && <span className="text-xs text-ink-400">{summary}</span>}
      {error && <span className="text-xs text-coral">{error}</span>}
    </div>
  );
}
