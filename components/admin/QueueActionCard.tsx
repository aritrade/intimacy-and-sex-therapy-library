"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Draft = {
  id: string;
  kind: string;
  language: string;
  brief: string;
  status: string;
  videoUrl: string | null;
  captionsSrt: string | null;
  scriptMd: string | null;
  createdAt: string;
};

const LANE_ACTION: Record<string, { label: string; loading: string; ok: string }> = {
  clinician: {
    label: "Approve script",
    loading: "Approving…",
    ok: "Approved → editor",
  },
  editor: {
    label: "Approve for publish",
    loading: "Approving…",
    ok: "Approved → publish",
  },
  publish: {
    label: "Publish to IG + YT",
    loading: "Publishing…",
    ok: "Published",
  },
};

export function QueueActionCard({ lane, draft }: { lane: string; draft: Draft }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  const action = LANE_ACTION[lane];
  const stale = isStale(draft.createdAt);

  async function onApprove() {
    setBusy(true);
    setError(null);
    try {
      let res: Response;
      if (lane === "publish") {
        if (
          !window.confirm(
            "Publish this to Instagram + YouTube? This is irreversible — IG/YT do not allow scheduled deletion.",
          )
        ) {
          setBusy(false);
          return;
        }
        res = await fetch(`/api/admin/drafts/${draft.id}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platforms: ["instagram", "youtube", "linkedin", "twitter"],
            iAmTheReviewerAndIWantToPublish: true,
          }),
        });
      } else {
        res = await fetch(`/api/admin/drafts/${draft.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: lane }),
        });
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          (json as { error?: string }).error ?? `${res.status} ${res.statusText}`,
        );
      } else {
        setDoneMessage(action.ok);
        router.refresh();
      }
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function onRequestChanges() {
    const note = window.prompt("What needs to change? (≤300 chars, no PII)");
    if (!note) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/drafts/${draft.id}/request-changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: lane, notes: note.slice(0, 300) }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError((json as { error?: string }).error ?? `${res.status}`);
      } else {
        setDoneMessage("Changes requested");
        router.refresh();
      }
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="pill text-[10px]">{draft.kind}</span>
        <span className="pill text-[10px]">{draft.language}</span>
        {stale && <span className="pill-coral text-[10px]">stale &gt;12h</span>}
        <span className="text-[10px] text-ink-400 ml-auto">
          {timeAgo(draft.createdAt)}
        </span>
      </div>

      <p className="text-sm text-ink-700 line-clamp-3" title={draft.brief}>
        {draft.brief}
      </p>

      {draft.videoUrl && (
        <video
          src={draft.videoUrl}
          controls
          preload="metadata"
          playsInline
          className="w-full rounded-lg border border-border bg-bg"
          style={{ maxHeight: 320 }}
        />
      )}

      {doneMessage ? (
        <p className="text-xs text-accent">{doneMessage}</p>
      ) : (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={onApprove}
            disabled={busy}
            className="btn-primary text-xs px-3 py-1.5"
          >
            {busy ? action.loading : action.label}
          </button>
          <button
            onClick={onRequestChanges}
            disabled={busy}
            className="pill text-[11px]"
          >
            Request changes
          </button>
          <Link
            href={`/admin/drafts/${draft.id}`}
            className="pill text-[11px] ml-auto opacity-80 hover:opacity-100"
          >
            Open →
          </Link>
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

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function isStale(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() > 12 * 60 * 60 * 1000;
}
