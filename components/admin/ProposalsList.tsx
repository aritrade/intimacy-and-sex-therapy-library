"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ProposalCard } from "./ProposalCard";
import { BulkRejectButton } from "./BulkRejectButton";

type ProposalRow = {
  id: string;
  kind: string;
  proposedBy: string;
  resourceId: string | null;
  resourceTitle: string | null;
  resourceUrl: string | null;
  payload: Record<string, unknown>;
  summary: string;
  evidence: Record<string, unknown>;
  confidence: number;
  status: string;
  createdAt: string;
};

/**
 * Client-side wrapper around the proposal list. Owns the multi-select
 * state so the operator can pick a subset of cards and bulk-approve or
 * bulk-reject them in one shot.
 *
 * Layout:
 *   - Sticky action bar at the top (shown only while in `open` status).
 *   - List of <label><checkbox/> <ProposalCard/></label> rows so clicks
 *     anywhere on the visual checkbox area toggle selection without
 *     interfering with the in-card Approve / Reject / Mark evergreen
 *     buttons.
 */
export function ProposalsList({
  rows,
  isOpenView,
  filterKind,
}: {
  rows: ProposalRow[];
  /** True when the user is viewing status=open — bulk actions only make sense there. */
  isOpenView: boolean;
  /** Current kind filter, or null for "All open". */
  filterKind: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = selected.size > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;
  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  }

  async function approveAll() {
    await runApprove({ ids: allIds }, `all ${allIds.length}`);
  }

  async function approveSelected() {
    if (selectedIds.length === 0) return;
    await runApprove({ ids: selectedIds }, `${selectedIds.length} selected`);
  }

  async function rejectSelected() {
    if (selectedIds.length === 0) return;
    if (
      !window.confirm(
        `Reject ${selectedIds.length} selected proposal(s)? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin/proposals/bulk-reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        rejected?: number;
        error?: string;
      };
      if (!res.ok) {
        setErr(j.error ?? `Failed (${res.status}).`);
      } else {
        setMsg(`Rejected ${j.rejected ?? 0}.`);
        setSelected(new Set());
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function runApprove(
    body: { ids: string[] },
    label: string,
  ): Promise<void> {
    if (body.ids.length === 0) return;
    if (
      !window.confirm(
        `Approve and apply ${label} proposal(s)?\n\nFor "new resource" cards, this creates UNPUBLISHED rows in the catalog that a curator can then publish. For "needs refresh" cards, this stamps the resource's notes. For "fix URL" cards, this updates the resource's URL live.\n\nProceed?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin/proposals/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as {
        applied?: number;
        errored?: number;
        results?: Array<{ ok: boolean; error?: string }>;
        error?: string;
      };
      if (!res.ok) {
        setErr(j.error ?? `Failed (${res.status}).`);
      } else {
        const applied = j.applied ?? 0;
        const errored = j.errored ?? 0;
        setMsg(
          errored === 0
            ? `Applied ${applied} of ${applied}.`
            : `Applied ${applied} · ${errored} errored — open the cards under "errored" filter for details.`,
        );
        setSelected(new Set());
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0) {
    return null; // empty-state is rendered by the page server-side
  }

  return (
    <div>
      {isOpenView && (
        <div className="card p-3 mb-4 sticky top-2 z-10 backdrop-blur bg-bg/80 border border-accent/30 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={toggleAll}
              disabled={busy}
              className="h-4 w-4"
            />
            <span className="text-ink-700">
              {allSelected
                ? "Deselect all"
                : someSelected
                  ? `${selected.size} selected — select all (${rows.length})`
                  : `Select all (${rows.length})`}
            </span>
          </label>

          <div className="h-5 w-px bg-border" aria-hidden />

          <button
            type="button"
            onClick={approveSelected}
            disabled={busy || selected.size === 0}
            className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40"
            title="Approve and apply only the cards you've ticked"
          >
            {busy ? "Working…" : `Approve selected (${selected.size})`}
          </button>
          <button
            type="button"
            onClick={approveAll}
            disabled={busy}
            className="btn-secondary text-xs"
            title={`Approve and apply all ${rows.length} cards in the current filter`}
          >
            {busy ? "Working…" : `Approve all ${rows.length}`}
          </button>
          <button
            type="button"
            onClick={rejectSelected}
            disabled={busy || selected.size === 0}
            className="pill-coral text-[11px] disabled:opacity-40"
            title="Reject only the cards you've ticked"
          >
            Reject selected ({selected.size})
          </button>

          <span className="ml-auto inline-flex items-center gap-2">
            <BulkRejectButton
              filter={{ kind: filterKind ?? null }}
              visibleCount={rows.length}
              disabled={busy}
            />
          </span>

          {msg && (
            <p
              role="status"
              className="basis-full text-[11px] text-ink-700 border border-teal/40 bg-teal/10 rounded-lg px-2 py-1.5"
            >
              {msg}
            </p>
          )}
          {err && (
            <p role="alert" className="basis-full text-[11px] text-coral">
              {err}
            </p>
          )}
        </div>
      )}

      <ul className="space-y-3">
        {rows.map((r) => {
          const checked = selected.has(r.id);
          return (
            <li key={r.id} className="relative">
              {isOpenView && (
                <label
                  className="absolute left-2 top-3 z-[1] flex items-center gap-1 cursor-pointer"
                  title={checked ? "Deselect" : "Select for bulk action"}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(r.id)}
                    disabled={busy}
                    className="h-4 w-4"
                    aria-label={`Select proposal: ${r.summary.slice(0, 60)}`}
                  />
                </label>
              )}
              <div className={isOpenView ? "pl-7" : undefined}>
                <ProposalCard proposal={r} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
