"use client";

import { useState } from "react";

export function HelpFlagRow({
  refId,
  reports,
  hidden: initialHidden,
  lastAt,
}: {
  refId: string;
  reports: number;
  hidden: boolean;
  lastAt: string;
}) {
  const [hidden, setHidden] = useState(initialHidden);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !hidden;
    try {
      const res = await fetch("/api/admin/help-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: refId, hidden: next }),
      });
      if (res.ok) setHidden(next);
    } catch {
      /* leave state unchanged on failure */
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 font-mono text-xs text-ink-700 break-all">{refId}</td>
      <td className="px-3 py-2 text-ink-900">{reports}</td>
      <td className="px-3 py-2 text-ink-400 whitespace-nowrap font-mono text-xs">{lastAt}</td>
      <td className="px-3 py-2">
        <span className={hidden ? "pill-coral text-[10px]" : "pill-teal text-[10px]"}>
          {hidden ? "Hidden" : "Visible"}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className="btn-secondary text-xs disabled:opacity-50"
        >
          {hidden ? "Unhide" : "Hide"}
        </button>
      </td>
    </tr>
  );
}
