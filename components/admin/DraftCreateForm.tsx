"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DraftCreateForm() {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [language, setLanguage] = useState<"en" | "hi" | "hinglish">("en");
  const [duration, setDuration] = useState<number>(60);
  const [style, setStyle] = useState<"typography" | "stock" | "carousel" | "long_form_essay">(
    "typography",
  );
  const [resourceId, setResourceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const kind =
        style === "carousel"
          ? "carousel"
          : style === "long_form_essay"
            ? "long_form"
            : "reel";
      const res = await fetch("/api/admin/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          language,
          durationSeconds: duration,
          resourceId: resourceId || undefined,
          style,
          kind,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Generation failed");
      } else {
        setBrief("");
        router.push(`/admin/drafts/${json.draft.id}`);
        router.refresh();
      }
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card p-5 space-y-4">
      <div>
        <label htmlFor="brief" className="block text-sm font-medium text-ink-900 mb-1">
          Brief
        </label>
        <textarea
          id="brief"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          required
          rows={3}
          placeholder="A 60s reel explaining responsive desire vs. spontaneous desire, gender-neutral, beginner audience."
          className="w-full rounded-xl border border-border bg-surface p-3 text-sm focus:border-accent focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Language">
          <select value={language} onChange={(e) => setLanguage(e.target.value as typeof language)} className="select">
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="hinglish">Hinglish</option>
          </select>
        </Field>
        <Field label="Style">
          <select value={style} onChange={(e) => setStyle(e.target.value as typeof style)} className="select">
            <option value="typography">Typography reel (9:16)</option>
            <option value="stock">Stock-footage reel (9:16)</option>
            <option value="carousel">Carousel (1:1, 5–10 slides)</option>
            <option value="long_form_essay">Long-form essay (16:9, 3–8 min)</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Duration (s)">
          <input
            type="number"
            min={15}
            max={600}
            step={15}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value) || 60)}
            className="select"
          />
        </Field>
        <Field label="Source resource id (optional)">
          <input
            type="text"
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
            placeholder="UUID for citation"
            className="select"
          />
        </Field>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          {error === "refusal"
            ? "The script generator refused this brief (likely a refusal category or crisis signal). Try a different angle."
            : error}
        </div>
      )}

      <button type="submit" disabled={submitting || !brief.trim()} className="btn-primary">
        {submitting ? "Generating script…" : "Generate clinician-safe script"}
      </button>
      <p className="text-[11px] text-ink-400">
        Generation uses the configured LLM (Groq Llama or Anthropic Claude) with a
        clinician-safe system prompt. The result is stored as <code>script_draft</code> —
        nothing is rendered or posted.
      </p>

      <style jsx>{`
        :global(.select) {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgb(var(--c-border));
          background-color: rgb(var(--c-surface));
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
        }
      `}</style>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-ink-400 mb-1">{label}</span>
      {children}
    </label>
  );
}
