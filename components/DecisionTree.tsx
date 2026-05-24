"use client";

import Link from "next/link";
import { useState } from "react";
import { DECISION_TREE, getNode } from "@/lib/decision-aids/start-therapy";

export function DecisionTree() {
  const [history, setHistory] = useState<string[]>(["start"]);
  const current = getNode(history[history.length - 1]);

  if (!current) return null;

  if (current.outcome) {
    return (
      <div className="card p-6 animate-fade-up">
        <p className="pill-accent w-fit">Recommendation</p>
        <h2 className="mt-3 font-serif text-2xl text-ink-900">{current.outcome.headline}</h2>
        <p className="mt-3 text-ink-700 max-w-prose leading-relaxed">{current.outcome.body}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {current.outcome.cta && (
            <Link href={current.outcome.cta.href} className="btn-primary">
              {current.outcome.cta.label} →
            </Link>
          )}
          <button
            type="button"
            onClick={() => setHistory(history.slice(0, -1))}
            className="btn-secondary"
          >
            ← Go back one step
          </button>
          <button
            type="button"
            onClick={() => setHistory(["start"])}
            className="btn-ghost"
          >
            Start over
          </button>
        </div>
        <p className="mt-5 text-xs text-ink-400">
          This is informational guidance, not a clinical assessment. The crisis button at
          the bottom right is always available.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-6 animate-fade-up">
      <header className="mb-4">
        <p className="text-xs uppercase tracking-wider text-ink-400">
          Step {history.length} of {DECISION_TREE.length}
        </p>
        <h2 className="mt-2 font-serif text-xl text-ink-900">{current.prompt}</h2>
        {current.body && <p className="mt-2 text-ink-600">{current.body}</p>}
      </header>
      <ul className="grid gap-2">
        {current.choices?.map((c) => (
          <li key={c.next}>
            <button
              type="button"
              onClick={() => setHistory([...history, c.next])}
              className="w-full text-left rounded-xl border border-border bg-surface px-4 py-3 hover:border-accent/40 hover:bg-accent-soft hover:text-accent-ink transition-colors"
            >
              {c.label}
            </button>
          </li>
        ))}
      </ul>
      {history.length > 1 && (
        <button
          type="button"
          onClick={() => setHistory(history.slice(0, -1))}
          className="mt-4 text-sm text-ink-400 hover:text-ink-900"
        >
          ← Back
        </button>
      )}
    </div>
  );
}
