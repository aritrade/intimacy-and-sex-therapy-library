"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** Filter context: what would actually get rejected by the button. */
  filter: {
    kind?: string | null;
    proposedBy?: string | null;
    minAgeDays?: number | null;
  };
  /** Friendly count shown to the operator before they confirm. */
  visibleCount: number;
  /** Disabled when there's nothing to act on. */
  disabled?: boolean;
};

/**
 * Bulk-reject the proposals matching the current /admin/proposals filter.
 * We send the SAME filter to the server (kind / proposedBy / minAgeDays)
 * so the server-side reject set matches what the operator can see.
 */
export function BulkRejectButton({ filter, visibleCount, disabled }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    if (visibleCount === 0) return;
    const labelBits: string[] = [];
    if (filter.kind) labelBits.push(`kind=${filter.kind}`);
    if (filter.proposedBy) labelBits.push(`agent=${filter.proposedBy}`);
    if (typeof filter.minAgeDays === "number") labelBits.push(`older than ${filter.minAgeDays}d`);
    const label = labelBits.join(", ") || "all open proposals";
    if (
      !window.confirm(
        `Reject all ${visibleCount} open proposals matching ${label}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {};
      if (filter.kind) body.kind = filter.kind;
      if (filter.proposedBy) body.proposedBy = filter.proposedBy;
      if (typeof filter.minAgeDays === "number") body.minAgeDays = filter.minAgeDays;
      const res = await fetch("/api/admin/proposals/bulk-reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { rejected?: number; error?: string };
      if (!res.ok) {
        setMsg(j.error ?? `Failed (${res.status}).`);
      } else {
        setMsg(`Rejected ${j.rejected ?? 0}.`);
        router.refresh();
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
        disabled={!!disabled || busy || visibleCount === 0}
        className="pill-coral text-[11px] disabled:opacity-40"
        title="Reject every open proposal matching the current filter"
      >
        {busy ? "Rejecting…" : `Reject all ${visibleCount}`}
      </button>
      {msg && <span className="text-[11px] text-ink-500">{msg}</span>}
    </div>
  );
}
