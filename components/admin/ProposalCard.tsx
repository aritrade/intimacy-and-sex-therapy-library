"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Proposal = {
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

const KIND_PILL: Record<string, string> = {
  fix_url: "pill-teal",
  needs_refresh: "pill-plum",
  new_resource: "pill-coral",
  remove_resource: "pill",
  metadata_drift: "pill",
};

export function ProposalCard({ proposal: p }: { proposal: Proposal }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "reject") {
    if (decision === "reject") {
      const note = window.prompt("Why reject? (optional, ≤300 chars)");
      if (note === null) return; // cancelled
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/proposals/${p.id}/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "reject", notes: note.slice(0, 300) || undefined }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError((j as { error?: string }).error ?? `${res.status}`);
        } else {
          setDone("Rejected");
          router.refresh();
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    if (
      !window.confirm(
        `Approve and apply this ${p.kind.replaceAll("_", " ")} proposal? This change goes live immediately.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/proposals/${p.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        applyResult?: { ok: boolean; error?: string; detail?: { hint?: string } };
      };
      if (!res.ok) {
        setError(j.error ?? `${res.status}`);
      } else if (j.applyResult && !j.applyResult.ok) {
        setDone(`Approved but apply failed: ${j.applyResult.error}`);
        if (j.applyResult.detail?.hint) {
          setError(j.applyResult.detail.hint);
        }
        router.refresh();
      } else {
        setDone("Applied");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <header className="flex items-center gap-2 flex-wrap">
        <span className={KIND_PILL[p.kind] ?? "pill"}>{p.kind.replaceAll("_", " ")}</span>
        <span className="pill text-[10px]">{p.proposedBy.replace(/^agent:/, "")}</span>
        <span className="pill text-[10px]">conf {p.confidence}</span>
        <span className="text-[11px] text-ink-400 ml-auto">
          {new Date(p.createdAt).toLocaleDateString()}
        </span>
      </header>

      <p className="text-sm text-ink-900 font-medium">{p.summary}</p>

      {p.resourceTitle && (
        <div className="text-xs text-ink-600">
          On resource:{" "}
          <strong className="text-ink-900">{p.resourceTitle}</strong>
          {p.resourceUrl && (
            <>
              {" — "}
              <a
                href={p.resourceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {new URL(p.resourceUrl).hostname}
              </a>
            </>
          )}
        </div>
      )}

      <PayloadView kind={p.kind} payload={p.payload} />

      {Object.keys(p.evidence).length > 0 && (
        <details className="text-xs text-ink-500">
          <summary className="cursor-pointer">Evidence</summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-bg p-2 font-mono">
            {JSON.stringify(p.evidence, null, 2)}
          </pre>
        </details>
      )}

      {done ? (
        <p className="text-xs text-accent">{done}</p>
      ) : (
        <div className="flex gap-2 pt-1 flex-wrap items-center">
          <button
            onClick={() => decide("approve")}
            disabled={busy}
            className="btn-primary text-xs px-3 py-1.5"
          >
            {busy ? "Working…" : "Approve & apply"}
          </button>
          <button
            onClick={() => decide("reject")}
            disabled={busy}
            className="pill text-[11px]"
          >
            Reject
          </button>
          {p.kind === "needs_refresh" && p.resourceId && (
            <MarkEvergreenButton
              resourceId={p.resourceId}
              busy={busy}
              setBusy={setBusy}
              setDone={setDone}
              setError={setError}
            />
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-[11px] text-warn">
          {error}
        </p>
      )}
    </div>
  );
}

function MarkEvergreenButton({
  resourceId,
  busy,
  setBusy,
  setDone,
  setError,
}: {
  resourceId: string;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setDone: (s: string | null) => void;
  setError: (s: string | null) => void;
}) {
  const router = useRouter();
  async function mark() {
    if (busy) return;
    if (
      !window.confirm(
        "Mark this resource as evergreen? The freshness agent will stop flagging it and any other open refresh proposals for this resource will be auto-rejected.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/resources/${resourceId}/evergreen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEvergreen: true, alsoRejectOpenRefreshProposals: true }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        rejectedProposals?: number;
      };
      if (!res.ok) {
        setError(j.error ?? `Failed (${res.status})`);
      } else {
        setDone(
          `Marked evergreen · ${j.rejectedProposals ?? 0} open refresh proposal(s) auto-rejected.`,
        );
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={mark}
      disabled={busy}
      className="pill-teal text-[11px]"
      title="Don't flag this resource as stale again — it's a foundational/evergreen reference."
    >
      Mark evergreen
    </button>
  );
}

function PayloadView({ kind, payload }: { kind: string; payload: Record<string, unknown> }) {
  if (kind === "fix_url") {
    return (
      <div className="rounded-lg border border-border bg-surface p-2 text-xs space-y-1">
        <div>
          <span className="text-ink-400">old:</span>{" "}
          <span className="font-mono text-ink-900 break-all">{String(payload.oldUrl)}</span>
        </div>
        <div>
          <span className="text-ink-400">new:</span>{" "}
          <a
            href={String(payload.newUrl)}
            target="_blank"
            rel="noreferrer"
            className="font-mono underline text-ink-900 break-all"
          >
            {String(payload.newUrl)}
          </a>
        </div>
        {payload.httpCode !== undefined && (
          <div className="text-ink-400">old returned HTTP {String(payload.httpCode)}</div>
        )}
      </div>
    );
  }
  if (kind === "needs_refresh") {
    return (
      <div className="rounded-lg border border-border bg-surface p-2 text-xs">
        Reason: <strong>{String(payload.reason)}</strong>
        {payload.ageDays !== undefined && (
          <span className="ml-2 text-ink-500">
            ({String(payload.ageDays)} days old, threshold {String(payload.thresholdDays)})
          </span>
        )}
      </div>
    );
  }
  if (kind === "new_resource") {
    return (
      <div className="rounded-lg border border-border bg-surface p-2 text-xs space-y-1">
        <div>
          <strong>{String(payload.title ?? "")}</strong>
        </div>
        <div className="text-ink-500">
          {String(payload.source ?? "")} · {String(payload.publishedYear ?? "—")} ·{" "}
          {String(payload.sourceSlug ?? "")}
        </div>
        {typeof payload.url === "string" && (
          <a
            href={payload.url}
            target="_blank"
            rel="noreferrer"
            className="underline text-ink-900 break-all"
          >
            {payload.url}
          </a>
        )}
        {typeof payload.abstract === "string" && (
          <p className="text-ink-700 line-clamp-3">{payload.abstract}</p>
        )}
      </div>
    );
  }
  return (
    <pre className="text-xs text-ink-600 max-h-32 overflow-auto rounded-lg bg-surface p-2 font-mono">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}
