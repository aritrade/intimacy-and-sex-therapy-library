"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { REQUEST_CHANGES_REASONS, type RequestChangesReason } from "@/lib/social/review-reasons";
import { PublishProgress } from "./PublishProgress";

export type ReviewerNote = {
  reason: string;
  notes?: string;
  by?: string;
  role?: string;
  ts?: string;
};

type Draft = {
  id: string;
  status: string;
  videoUrl: string | null;
  clinicianReviewerId: string | null;
  editorReviewerId: string | null;
  reviewerNotes?: ReviewerNote[] | null;
};

type Capabilities = {
  clinicianApprove: boolean;
  editorApprove: boolean;
  requestChanges: boolean;
  publish: boolean;
};

export function DraftReviewActions({
  draft,
  capabilities,
  reviewerRole,
}: {
  draft: Draft;
  capabilities: Capabilities;
  reviewerRole: "clinician" | "editor" | "admin";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [platforms, setPlatforms] = useState<{
    instagram: boolean;
    youtube: boolean;
    facebook: boolean;
  }>({
    instagram: false,
    youtube: false,
    facebook: false,
  });
  const [reason, setReason] = useState<RequestChangesReason>("factual_inaccuracy");
  const [notes, setNotes] = useState("");

  async function approve(role: "clinician" | "editor") {
    setBusy(role);
    setError(null);
    try {
      const res = await fetch(`/api/admin/drafts/${draft.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) setError(j?.error ?? "Approval failed");
      else router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const [rewriteMessage, setRewriteMessage] = useState<string | null>(null);

  async function requestChanges() {
    setBusy("request-changes");
    setError(null);
    try {
      const res = await fetch(`/api/admin/drafts/${draft.id}/request-changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, notes: notes.trim() || undefined, role: reviewerRole }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(j?.error ?? "Submission failed");
      } else {
        setNotes("");
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function rewriteWithNotes(autoRender: boolean) {
    const trimmedNote = notes.trim();
    const hasPriorNotes = (draft.reviewerNotes?.length ?? 0) > 0;
    if (!trimmedNote && !hasPriorNotes) {
      setError(
        "Add a note (or have at least one prior note) before asking the LLM to rewrite.",
      );
      return;
    }
    const confirmMsg = autoRender
      ? "Rewrite the script using all reviewer notes, then auto-render the new video? Status will reset to script_draft and the existing video URL will be cleared."
      : "Rewrite the script using all reviewer notes? Status will reset to script_draft and the existing video URL will be cleared.";
    if (!window.confirm(confirmMsg)) return;
    setBusy("rewrite");
    setError(null);
    setRewriteMessage(null);
    try {
      const body: Record<string, unknown> = {
        role: reviewerRole,
        autoRender,
      };
      if (trimmedNote) {
        body.reason = reason;
        body.notes = trimmedNote;
      }
      const res = await fetch(`/api/admin/drafts/${draft.id}/rewrite-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        appliedNoteCount?: number;
        newWordCount?: number;
        newChapterCount?: number;
        renderDispatched?: boolean;
        renderUrl?: string;
        renderError?: string;
        error?: string;
        reason?: string;
        detail?: string;
      } | null;
      if (!res.ok || !j?.ok) {
        setError(j?.detail ?? j?.reason ?? j?.error ?? `Rewrite failed (HTTP ${res.status})`);
      } else {
        const parts = [
          `Rewrote with ${j.appliedNoteCount} note${j.appliedNoteCount === 1 ? "" : "s"}`,
          `${j.newWordCount} words across ${j.newChapterCount} chapter${j.newChapterCount === 1 ? "" : "s"}`,
        ];
        if (j.renderDispatched) parts.push("render dispatched — refresh in ~3 min");
        else if (j.renderError) parts.push(`render skipped: ${j.renderError}`);
        setRewriteMessage(parts.join(" · "));
        setNotes("");
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  const [publishingPlatforms, setPublishingPlatforms] = useState<
    Array<"instagram" | "youtube" | "facebook"> | null
  >(null);
  const [renderMessage, setRenderMessage] = useState<string | null>(null);

  async function triggerRender() {
    const verb = draft.videoUrl ? "Re-render" : "Render";
    const confirmMsg = draft.videoUrl
      ? "Re-render this draft on GitHub Actions? The current video URL stays live until the new render completes (~3 min)."
      : "Trigger a render on GitHub Actions? Takes ~3 min.";
    if (!window.confirm(confirmMsg)) return;
    setBusy("render");
    setError(null);
    setRenderMessage(null);
    try {
      const res = await fetch(`/api/admin/drafts/${draft.id}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        runsUrl?: string;
        error?: string;
        detail?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        setError(
          json?.detail ?? json?.error ?? `${verb} failed (HTTP ${res.status})`,
        );
      } else {
        setRenderMessage(
          json.runsUrl
            ? `${verb} dispatched. Watch on GH Actions, then refresh in ~3 min.`
            : `${verb} dispatched. Refresh in ~3 min.`,
        );
      }
    } finally {
      setBusy(null);
    }
  }

  function startPublish() {
    if (!confirm) {
      setError("Tick the attestation checkbox before publishing.");
      return;
    }
    const sel = (
      Object.keys(platforms) as Array<"instagram" | "youtube" | "facebook">
    ).filter((k) => platforms[k]);
    if (sel.length === 0) {
      setError("Select at least one platform.");
      return;
    }
    setError(null);
    setBusy("publish");
    setPublishingPlatforms(sel);
  }

  // Match the server-side gate in /api/admin/drafts/[id]/publish.
  // `posted` and `failed` are publishable too because publishDraft
  // now merges into existing platformPostIds — re-clicking publish
  // is the recovery path for a partial-success run.
  const canPublishNow =
    (draft.status === "editor_reviewed" ||
      draft.status === "scheduled" ||
      draft.status === "posted" ||
      draft.status === "failed") &&
    !!draft.videoUrl;

  return (
    <section className="card p-5 mt-4">
      <h2 className="font-serif text-xl text-ink-900">Actions</h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => approve("clinician")}
          disabled={
            !!busy || !capabilities.clinicianApprove || draft.status !== "script_draft"
          }
          className="btn-secondary"
          title={
            !capabilities.clinicianApprove
              ? "Requires clinician role"
              : draft.status !== "script_draft"
                ? "Draft is not in script_draft state"
                : undefined
          }
        >
          {busy === "clinician" ? "Approving…" : "Clinician approve"}
        </button>
        <button
          type="button"
          onClick={() => approve("editor")}
          disabled={
            !!busy ||
            !capabilities.editorApprove ||
            (draft.status !== "rendered" && draft.status !== "clinician_reviewed")
          }
          className="btn-secondary"
          title={
            !capabilities.editorApprove
              ? "Requires editor role"
              : draft.status !== "rendered" && draft.status !== "clinician_reviewed"
                ? "Draft is not awaiting editor review"
                : undefined
          }
        >
          {busy === "editor" ? "Approving…" : "Editor approve"}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-surface p-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-serif text-sm text-ink-900">Render</h3>
            <p className="text-xs text-ink-600 mt-0.5">
              {draft.videoUrl
                ? "A rendered video already exists. Re-rendering overwrites it after the GH Action completes (2-3 min)."
                : "No video yet. Trigger a render on GitHub Actions (2-3 min). The hourly :53 cron also picks this up automatically."}
            </p>
            {renderMessage && (
              <p className="mt-1.5 text-xs text-accent">{renderMessage}</p>
            )}
          </div>
          <button
            type="button"
            onClick={triggerRender}
            disabled={busy === "render"}
            className="pill text-xs"
          >
            {busy === "render"
              ? "Dispatching…"
              : draft.videoUrl
                ? "Re-render"
                : "Render"}
          </button>
        </div>
      </div>

      {capabilities.requestChanges && (
        <div className="mt-6 rounded-xl border border-border bg-surface p-4">
          <h3 className="font-serif text-lg text-ink-900">Request changes</h3>
          <p className="mt-1 text-sm text-ink-600">
            Append structured feedback to the draft. The reason is recorded in
            the audit log; the free-text notes are PII-scrubbed and stored on
            the draft for the next reviewer.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="block text-ink-700 mb-1">Reason</span>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as RequestChangesReason)}
                className="w-full rounded-lg border border-border bg-bg p-2 text-sm"
              >
                {REQUEST_CHANGES_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-ink-700 mb-1">Acting as</span>
              <input
                value={reviewerRole}
                disabled
                className="w-full rounded-lg border border-border bg-surface p-2 text-sm font-mono text-ink-400"
              />
            </label>
          </div>

          <label className="mt-3 block text-sm">
            <span className="block text-ink-700 mb-1">Notes (≤ 600 chars; PII-scrubbed)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 600))}
              rows={3}
              className="w-full rounded-lg border border-border bg-bg p-2 text-sm"
              placeholder="Optional: what specifically needs to change?"
            />
            <span className="text-xs text-ink-400">{notes.length}/600</span>
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={requestChanges}
              disabled={!!busy}
              className="btn-secondary"
              title="Save this note for the next reviewer to read. No script change."
            >
              {busy === "request-changes" ? "Saving…" : "Append note"}
            </button>
            <button
              type="button"
              onClick={() => rewriteWithNotes(true)}
              disabled={!!busy}
              className="btn-primary"
              title="Append note + ask the LLM to rewrite the script using ALL accumulated notes, then auto-render the new video."
            >
              {busy === "rewrite" ? "Rewriting…" : "Apply notes & rewrite + render"}
            </button>
            <button
              type="button"
              onClick={() => rewriteWithNotes(false)}
              disabled={!!busy}
              className="pill text-xs"
              title="Rewrite the script but don't auto-render. Useful when you want to review the new script before spending a render."
            >
              {busy === "rewrite" ? "Rewriting…" : "Rewrite only (no render)"}
            </button>
          </div>

          {rewriteMessage && (
            <p className="mt-3 text-xs text-accent">{rewriteMessage}</p>
          )}

          {draft.reviewerNotes && draft.reviewerNotes.length > 0 && (
            <details className="mt-4 text-xs">
              <summary className="cursor-pointer text-ink-600 hover:text-ink-900">
                Prior notes on this draft ({draft.reviewerNotes.length})
              </summary>
              <ul className="mt-2 space-y-2">
                {draft.reviewerNotes.map((n, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-border bg-bg p-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-ink-400">
                      <span className="font-mono">{n.reason}</span>
                      <span>
                        {n.role && <span className="mr-2">{n.role}</span>}
                        {n.ts && <span>{new Date(n.ts).toLocaleString()}</span>}
                      </span>
                    </div>
                    {n.notes && (
                      <p className="mt-1 text-ink-700">{n.notes}</p>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-coral/30 bg-coral/5 p-4">
        <h3 className="font-serif text-lg text-ink-900">Publish</h3>
        <p className="mt-1 text-sm text-ink-600">
          Publish requires both clinician and editor approval AND your explicit
          attestation. Nothing is auto-scheduled or auto-posted.
        </p>

        <fieldset className="mt-3">
          <legend className="sr-only">Platforms</legend>
          <label className="inline-flex items-center gap-2 mr-4 text-sm">
            <input
              type="checkbox"
              checked={platforms.instagram}
              disabled={!capabilities.publish}
              onChange={(e) => setPlatforms((p) => ({ ...p, instagram: e.target.checked }))}
            />
            Instagram Reels
          </label>
          <label className="inline-flex items-center gap-2 mr-4 text-sm">
            <input
              type="checkbox"
              checked={platforms.youtube}
              disabled={!capabilities.publish}
              onChange={(e) => setPlatforms((p) => ({ ...p, youtube: e.target.checked }))}
            />
            YouTube Shorts
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={platforms.facebook}
              disabled={!capabilities.publish}
              onChange={(e) => setPlatforms((p) => ({ ...p, facebook: e.target.checked }))}
            />
            Facebook Reels
          </label>
        </fieldset>

        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirm}
            disabled={!capabilities.publish}
            onChange={(e) => setConfirm(e.target.checked)}
            className="mt-1"
          />
          <span>
            I have personally reviewed this draft and I take responsibility for
            posting it from this account.
          </span>
        </label>

        {!publishingPlatforms && (
          <button
            type="button"
            onClick={startPublish}
            disabled={!canPublishNow || !confirm || !capabilities.publish}
            className="mt-3 btn-primary"
          >
            Publish to selected platforms
          </button>
        )}

        {!publishingPlatforms && !capabilities.publish ? (
          <p className="mt-2 text-xs text-ink-400">
            Publishing requires the editor or admin role.
          </p>
        ) : !publishingPlatforms && !canPublishNow ? (
          <p className="mt-2 text-xs text-ink-400">
            {draft.status !== "editor_reviewed" &&
            draft.status !== "scheduled" &&
            draft.status !== "posted" &&
            draft.status !== "failed"
              ? "Both clinician and editor must approve first."
              : !draft.videoUrl
                ? "Draft has no video URL yet — render it and host via a public HTTPS URL."
                : null}
          </p>
        ) : null}

        {publishingPlatforms && (
          <div className="mt-4">
            <PublishProgress
              draftId={draft.id}
              platforms={publishingPlatforms}
              onDone={(summary) => {
                setBusy(null);
                // Build a concise summary banner so the operator sees
                // what happened at a glance, then refresh the page
                // so the queue + post-id strip reflect the new state.
                if (!summary.ok) {
                  setError(
                    summary.failures
                      .map((f) => `${f.platform}: ${f.reason}${f.detail ? ` — ${f.detail.slice(0, 200)}` : ""}`)
                      .join("; "),
                  );
                }
                router.refresh();
              }}
              onCancel={() => {
                setBusy(null);
                setPublishingPlatforms(null);
              }}
            />
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-ink-900">
          {error}
        </div>
      )}
    </section>
  );
}
