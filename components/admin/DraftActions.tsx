"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Draft = {
  id: string;
  status: string;
  videoUrl: string | null;
  clinicianReviewerId: string | null;
  editorReviewerId: string | null;
};

export function DraftActions({ draft }: { draft: Draft }) {
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

  async function approve(role: "clinician" | "editor") {
    setBusy(role);
    setError(null);
    try {
      const res = await fetch(`/api/admin/drafts/${draft.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const j = await res.json();
      if (!res.ok) setError(j.error ?? "Approval failed");
      else router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
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
    setBusy("publish");
    setError(null);
    try {
      const res = await fetch(`/api/admin/drafts/${draft.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms: sel,
          iAmTheReviewerAndIWantToPublish: true,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        const detail =
          (j.failures && j.failures.length > 0
            ? j.failures.map((f: { platform: string; reason: string; detail?: string }) =>
                `${f.platform}: ${f.reason}${f.detail ? ` — ${f.detail}` : ""}`).join("; ")
            : null) ?? j.detail ?? j.error ?? "Publish failed";
        setError(detail);
      } else {
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  const canPublish = draft.status === "editor_reviewed" && draft.videoUrl;

  return (
    <section className="card p-5 mt-4">
      <h2 className="font-serif text-xl text-ink-900">Actions</h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => approve("clinician")}
          disabled={!!busy || draft.status !== "script_draft"}
          className="btn-secondary"
        >
          {busy === "clinician" ? "Approving…" : "Clinician approve"}
        </button>
        <button
          type="button"
          onClick={() => approve("editor")}
          disabled={!!busy || (draft.status !== "rendered" && draft.status !== "clinician_reviewed")}
          className="btn-secondary"
        >
          {busy === "editor" ? "Approving…" : "Editor approve"}
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-warn/30 bg-warn/5 p-4">
        <h3 className="font-serif text-lg text-ink-900">Publish</h3>
        <p className="mt-1 text-sm text-ink-600">
          Publish requires both clinician and editor approval AND your explicit attestation.
        </p>

        <fieldset className="mt-3">
          <legend className="sr-only">Platforms</legend>
          <label className="inline-flex items-center gap-2 mr-4 text-sm">
            <input
              type="checkbox"
              checked={platforms.instagram}
              onChange={(e) => setPlatforms((p) => ({ ...p, instagram: e.target.checked }))}
            />
            Instagram Reels
          </label>
          <label className="inline-flex items-center gap-2 mr-4 text-sm">
            <input
              type="checkbox"
              checked={platforms.youtube}
              onChange={(e) => setPlatforms((p) => ({ ...p, youtube: e.target.checked }))}
            />
            YouTube Shorts
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={platforms.facebook}
              onChange={(e) => setPlatforms((p) => ({ ...p, facebook: e.target.checked }))}
            />
            Facebook Reels
          </label>
        </fieldset>

        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
            className="mt-1"
          />
          <span>
            I have personally reviewed this draft and I take responsibility for posting it
            from this account.
          </span>
        </label>

        <button
          type="button"
          onClick={publish}
          disabled={!canPublish || !confirm || busy === "publish"}
          className="mt-3 btn-primary"
        >
          {busy === "publish" ? "Publishing…" : "Publish to selected platforms"}
        </button>

        {!canPublish && (
          <p className="mt-2 text-xs text-ink-400">
            {draft.status !== "editor_reviewed"
              ? "Both clinician and editor must approve first."
              : "Draft has no video URL yet — render it to /public/renders/<id>/video.mp4 and host it via a public HTTPS URL."}
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          {error}
        </div>
      )}
    </section>
  );
}
