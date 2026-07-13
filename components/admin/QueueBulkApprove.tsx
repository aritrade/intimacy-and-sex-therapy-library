"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Fast bulk-approval bar for the queue.
 *
 * Collapses the clinician + editor gates into one deliberate admin action for
 * every draft currently awaiting review, then lets the auto-scheduler stagger
 * them out. Still a human click behind the admin gate with an explicit
 * attestation — not auto-approval.
 */
export function QueueBulkApprove({
  ids,
  postsPerDay,
}: {
  ids: string[];
  postsPerDay: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (ids.length === 0) return null;

  async function onApproveAll() {
    if (
      !window.confirm(
        `Fast-approve ${ids.length} draft${ids.length === 1 ? "" : "s"}? ` +
          `This clears BOTH the clinician and editor gates in one step and auto-schedules them ` +
          `at ${postsPerDay}/day. Only do this if you are the qualified reviewer and have vetted the content.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/drafts/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, iAmTheReviewerAndIApprove: true }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
        summary?: { approved: number; skipped: number };
      };
      if (!res.ok) {
        setError(json.detail ?? json.error ?? `${res.status} ${res.statusText}`);
      } else {
        const s = json.summary;
        setDone(
          s
            ? `Approved ${s.approved}, skipped ${s.skipped}. Rolling out at ${postsPerDay}/day.`
            : "Approved.",
        );
        router.refresh();
      }
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-3 flex items-center gap-3 flex-wrap">
      <div className="text-sm text-ink-700">
        <strong>{ids.length}</strong> draft{ids.length === 1 ? "" : "s"} awaiting review
      </div>
      {done ? (
        <p className="text-xs text-accent">{done}</p>
      ) : (
        <>
          <button
            onClick={onApproveAll}
            disabled={busy}
            className="btn-primary text-xs px-3 py-1.5"
            title="Clear both gates and auto-schedule the whole review backlog"
          >
            {busy ? "Approving…" : "Fast-approve all → schedule"}
          </button>
          <span className="text-[11px] text-ink-400">
            Collapses clinician + editor sign-off into one action.
          </span>
        </>
      )}
      {error && (
        <p role="alert" className="text-[11px] text-warn w-full">
          {error}
        </p>
      )}
    </div>
  );
}
