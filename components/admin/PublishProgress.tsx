"use client";

/**
 * Live per-platform publish progress UI.
 *
 * Consumes NDJSON events from /api/admin/drafts/[id]/publish-stream
 * (see `ProgressEvent` in lib/social/publish-progress.ts for the shape).
 *
 * Layout: one row per platform with:
 *   - Status pip:    spinner (running) / green tick (success) / red X (failed) / grey dash (skipped/queued)
 *   - Platform name
 *   - Progress bar 0-100% (only while running)
 *   - Outcome line (post id link OR error reason + detail tooltip)
 *
 * The component is "fire-and-forget" from the parent's POV — start it
 * with a draftId + platforms array, it streams to completion, and
 * fires `onDone(ok, finalState)` so the parent can refresh the draft.
 */

import { useEffect, useMemo, useRef, useState } from "react";

type PlatformId = "instagram" | "youtube" | "facebook";

type PlatformState = {
  platform: PlatformId;
  status: "queued" | "running" | "skipped" | "success" | "failed";
  pct: number;
  note?: string;
  attempt?: number;
  maxAttempts?: number;
  postId?: string;
  reason?: string;
  detail?: string;
  startedAt?: number;
  finishedAt?: number;
};

type DoneSummary = {
  ok: boolean;
  platformPostIds: Record<string, string>;
  failures: Array<{ platform: string; reason: string; detail?: string }>;
  skipped: string[];
};

const PLATFORM_META: Record<
  PlatformId,
  { label: string; postUrl: (id: string) => string }
> = {
  instagram: {
    label: "Instagram Reels",
    postUrl: () => "https://www.instagram.com/intimacylibrary/",
  },
  youtube: {
    label: "YouTube Shorts",
    postUrl: (id) => `https://youtube.com/shorts/${id}`,
  },
  facebook: {
    label: "Facebook Reels",
    postUrl: () => "https://www.facebook.com/profile.php?id=61590557572787",
  },
};

export function PublishProgress({
  draftId,
  platforms,
  onDone,
  onCancel,
}: {
  draftId: string;
  platforms: PlatformId[];
  onDone: (summary: DoneSummary) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Map<PlatformId, PlatformState>>(() => {
    const initial = new Map<PlatformId, PlatformState>();
    for (const p of platforms) {
      initial.set(p, { platform: p, status: "queued", pct: 0 });
    }
    return initial;
  });
  // Client-side "smooth pct" per platform — interpolates between the
  // pct events the server emits so the bar visibly moves even during
  // the long pauses (IG warmup is 5s between ticks; IG retry backoff
  // is 30s; YT upload progress arrives in chunks of variable size).
  // Each tick the value creeps toward `realPct + 12` capped at 98%,
  // and snaps to 100 when the platform completes. Never decreases.
  const [displayPcts, setDisplayPcts] = useState<Record<string, number>>({});
  const [terminal, setTerminal] = useState<DoneSummary | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    abortRef.current = ac;

    (async () => {
      try {
        const res = await fetch(
          `/api/admin/drafts/${draftId}/publish-stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              platforms,
              iAmTheReviewerAndIWantToPublish: true,
            }),
            signal: ac.signal,
          },
        );
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          setStreamError(`HTTP ${res.status}: ${text.slice(0, 200) || "no body"}`);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        // NDJSON parse loop. Browser fetch already buffers chunks; we
        // accumulate them and split on \n. The last (possibly partial)
        // line is kept in `buffer` until the next chunk completes it.
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let lineEnd: number;
          while ((lineEnd = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, lineEnd).trim();
            buffer = buffer.slice(lineEnd + 1);
            if (!line) continue;
            let evt: any;
            try {
              evt = JSON.parse(line);
            } catch {
              continue;
            }
            applyEvent(evt);
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setStreamError(String((e as Error).message));
      }
    })();

    return () => {
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animation loop for the smooth progress creep. Runs at ~8 fps
  // (120ms) which is smooth enough for a progress bar and easy on
  // CPU. Stops automatically once every row has terminated.
  useEffect(() => {
    const id = setInterval(() => {
      setDisplayPcts((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const row of rows.values()) {
          const cur = next[row.platform] ?? 0;
          let target: number;
          if (row.status === "success" || row.status === "skipped") {
            target = 100;
          } else if (row.status === "failed") {
            target = cur; // freeze where we were
          } else if (row.status === "running") {
            // Soft ceiling 12 pts ahead of the last real event so the
            // bar keeps moving between server events, but never runs
            // away to 100% without confirmation.
            target = Math.min(98, row.pct + 12);
          } else {
            // queued
            target = 0;
          }
          let nextVal = cur;
          if (cur < row.pct) {
            // A new event jumped pct ahead of us — catch up fast.
            nextVal = Math.min(row.pct, cur + 2.5);
          } else if (cur < target) {
            // Soft creep toward the soft ceiling.
            nextVal = Math.min(target, cur + 0.45);
          } else if (target < cur && (row.status === "success" || row.status === "skipped")) {
            // Snap up to 100 fast on completion.
            nextVal = Math.min(100, cur + 6);
          }
          if (Math.abs(nextVal - cur) > 0.01) {
            next[row.platform] = nextVal;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 120);
    return () => clearInterval(id);
  }, [rows]);

  function applyEvent(evt: any) {
    if (evt.event === "platform_start") {
      setRows((prev) => {
        const next = new Map(prev);
        const p = evt.platform as PlatformId;
        const existing = next.get(p);
        if (existing) {
          next.set(p, { ...existing, status: "running", startedAt: Date.now() });
        }
        return next;
      });
    } else if (evt.event === "platform_stage") {
      setRows((prev) => {
        const next = new Map(prev);
        const p = evt.platform as PlatformId;
        const existing = next.get(p);
        if (existing) {
          next.set(p, {
            ...existing,
            status: "running",
            pct: evt.pct,
            note: evt.note,
            attempt: evt.attempt,
            maxAttempts: evt.maxAttempts,
            startedAt: existing.startedAt ?? Date.now(),
          });
        }
        return next;
      });
    } else if (evt.event === "platform_done") {
      setRows((prev) => {
        const next = new Map(prev);
        const p = evt.platform as PlatformId;
        const existing = next.get(p) ?? { platform: p, status: "queued", pct: 0 };
        next.set(p, {
          ...existing,
          status: evt.ok ? "success" : "failed",
          pct: 100,
          postId: evt.ok ? evt.postId : undefined,
          reason: !evt.ok ? evt.reason : undefined,
          detail: !evt.ok ? evt.detail : undefined,
          note: undefined,
          finishedAt: Date.now(),
        });
        return next;
      });
    } else if (evt.event === "platform_skipped") {
      setRows((prev) => {
        const next = new Map(prev);
        const p = evt.platform as PlatformId;
        const existing = next.get(p) ?? { platform: p, status: "queued", pct: 0 };
        next.set(p, {
          ...existing,
          status: "skipped",
          pct: 100,
          postId: evt.existingId,
          note: "Already posted — skipped",
          finishedAt: Date.now(),
        });
        return next;
      });
    } else if (evt.event === "done") {
      const summary: DoneSummary = {
        ok: evt.ok,
        platformPostIds: evt.platformPostIds ?? {},
        failures: evt.failures ?? [],
        skipped: evt.skipped ?? [],
      };
      setTerminal(summary);
      onDone(summary);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">
          {terminal
            ? terminal.ok
              ? "Done."
              : "Some platforms failed — see details below."
            : "Publishing… do not close this tab."}
        </p>
        {!terminal && (
          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort();
              onCancel();
            }}
            className="text-xs text-ink-400 hover:text-ink-700 underline"
          >
            Cancel
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {Array.from(rows.values()).map((row) => (
          <ProgressRow
            key={row.platform}
            row={row}
            displayPct={displayPcts[row.platform] ?? 0}
          />
        ))}
      </ul>

      {streamError && (
        <div
          role="alert"
          className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm"
        >
          Stream error: {streamError}
        </div>
      )}
    </div>
  );
}

function ProgressRow({
  row,
  displayPct,
}: {
  row: PlatformState;
  displayPct: number;
}) {
  const meta = PLATFORM_META[row.platform];
  const elapsedMs =
    row.startedAt && row.finishedAt
      ? row.finishedAt - row.startedAt
      : row.startedAt
        ? Date.now() - row.startedAt
        : undefined;

  // Visual pct = smoothed displayPct. Header label rounds for tidy
  // display. When the bar terminates we always show 100% (success/
  // skipped) or the last real pct (failed) so the operator sees the
  // bar in a stable state rather than mid-animation.
  const visualPct = useMemo(() => {
    if (row.status === "success" || row.status === "skipped") return 100;
    if (row.status === "failed") return row.pct;
    return Math.max(0, Math.min(100, displayPct));
  }, [row.status, row.pct, displayPct]);

  return (
    <li className="rounded-xl border border-border bg-bg p-3">
      <div className="flex items-center gap-3">
        <StatusPip status={row.status} />
        <span className="font-medium text-sm text-ink-900">{meta.label}</span>
        <span className="ml-auto text-xs text-ink-400 tabular-nums">
          {row.status === "running" && `${Math.round(visualPct)}%`}
          {row.status === "success" && elapsedMs && `${(elapsedMs / 1000).toFixed(1)}s`}
          {row.status === "failed" && elapsedMs && `${(elapsedMs / 1000).toFixed(1)}s`}
          {row.status === "skipped" && "skipped"}
        </span>
      </div>

      {row.status === "running" && (
        <div className="mt-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-150 ease-out"
              style={{ width: `${visualPct}%` }}
            />
          </div>
          {row.note && (
            <p className="mt-1.5 text-xs text-ink-400">
              {row.note}
              {row.attempt && row.maxAttempts && (
                <span className="ml-1">
                  · attempt {row.attempt}/{row.maxAttempts}
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {row.status === "success" && row.postId && (
        <p className="mt-1.5 text-xs text-ink-600">
          Posted ·{" "}
          <a
            href={meta.postUrl(row.postId)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            view on {row.platform}
          </a>
          <span className="ml-2 text-ink-400 font-mono">id: {row.postId}</span>
        </p>
      )}

      {row.status === "skipped" && row.postId && (
        <p className="mt-1.5 text-xs text-ink-400">
          Already posted earlier · id: <span className="font-mono">{row.postId}</span>
        </p>
      )}

      {row.status === "failed" && (
        <div className="mt-1.5 text-xs text-coral">
          <p className="font-medium">Failed: {row.reason}</p>
          {row.detail && (
            <p className="mt-0.5 text-ink-400 font-mono break-all">{row.detail.slice(0, 320)}</p>
          )}
        </div>
      )}
    </li>
  );
}

function StatusPip({ status }: { status: PlatformState["status"] }) {
  if (status === "running") {
    return (
      <span
        className="inline-block h-4 w-4 rounded-full border-2 border-ink-700 border-t-transparent animate-spin"
        aria-label="In progress"
      />
    );
  }
  if (status === "success") {
    return (
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-teal text-white text-[10px] font-bold"
        aria-label="Success"
        title="Posted"
      >
        ✓
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-coral text-white text-[10px] font-bold"
        aria-label="Failed"
        title="Failed"
      >
        ✕
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-ink-200 bg-surface text-[10px] text-ink-400"
        aria-label="Skipped"
        title="Already posted earlier"
      >
        –
      </span>
    );
  }
  // queued
  return (
    <span
      className="inline-block h-4 w-4 rounded-full border border-ink-200 bg-surface"
      aria-label="Queued"
      title="Waiting"
    />
  );
}
