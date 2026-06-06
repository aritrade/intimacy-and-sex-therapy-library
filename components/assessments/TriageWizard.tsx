"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CONCERNS, recommend } from "@/lib/assessments/triage";
import { trackEvent } from "@/components/Analytics";

export function TriageWizard() {
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const results = useMemo(() => (submitted ? recommend(selected) : []), [submitted, selected]);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  if (submitted) {
    return (
      <div className="animate-fade-up">
        <div className="card p-6">
          <h2 className="font-serif text-2xl text-ink-900">Your suggested assessments</h2>
          <p className="mt-2 text-ink-600 max-w-prose">
            Based on what you selected. There’s no need to take them all — start with whichever
            feels most relevant. Each is scored privately in your browser.
          </p>

          <ol className="mt-5 space-y-3">
            {results.map((inst, idx) => (
              <li key={inst.id}>
                <Link
                  href={`/assessments/${inst.id}`}
                  className="card card-hover p-4 flex items-start gap-4 group"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent-ink">
                    {idx + 1}
                  </span>
                  <span className="flex-1">
                    <span className="flex items-center gap-2">
                      <span className="pill-accent">{inst.shortName}</span>
                      {inst.estMinutes != null && (
                        <span className="text-xs text-ink-400">{inst.estMinutes} min</span>
                      )}
                    </span>
                    <span className="mt-1 block font-serif text-ink-900 group-hover:text-accent-ink">
                      {inst.name}
                    </span>
                    <span className="mt-1 block text-sm text-ink-600">{inst.description}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>

          <div className="mt-6 rounded-xl border border-accent/30 bg-accent-soft p-4 text-sm text-accent-ink">
            <strong>Tip:</strong> once you’ve completed a few, the{" "}
            <Link href="/assessments/reflection" className="underline">
              screening reflection
            </Link>{" "}
            can pull your results together into a plain-language summary and suggest next
            steps. It’s educational support, never a diagnosis.
          </div>

          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
            }}
            className="btn-ghost mt-5"
          >
            ← Change my answers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <fieldset>
        <legend className="font-serif text-xl text-ink-900">
          What would you like to understand better right now?
        </legend>
        <p className="mt-1 text-sm text-ink-500">Select all that apply.</p>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {CONCERNS.map((c) => {
            const on = selected.includes(c.id);
            return (
              <li key={c.id}>
                <label
                  className={`flex h-full cursor-pointer flex-col rounded-xl border p-4 transition-colors ${
                    on
                      ? "border-accent bg-accent-soft"
                      : "border-border bg-surface hover:bg-elevated"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(c.id)}
                      className="h-4 w-4 accent-accent"
                    />
                    <span className="font-medium text-ink-900">{c.label}</span>
                  </span>
                  {c.hint && <span className="mt-1 pl-6 text-sm text-ink-500">{c.hint}</span>}
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={selected.length === 0}
          onClick={() => {
            setSubmitted(true);
            trackEvent("assessment_triage_completed", { concerns: selected.length });
          }}
          className="btn-primary"
        >
          Show my assessments →
        </button>
        <span className="text-xs text-ink-400">{selected.length} selected · nothing is stored</span>
      </div>
    </div>
  );
}
