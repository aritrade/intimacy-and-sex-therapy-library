"use client";

import { useState } from "react";
import type { Instrument } from "@/lib/assessments/instruments";
import type { ScoringResult } from "@/lib/assessments/scoring";
import { trackEvent } from "./Analytics";
import { recordResult } from "./assessments/results-store";

type Response = { instrumentId: string; name: string; result: ScoringResult; citation: string };

const FLAG_STYLES: Record<ScoringResult["flag"], string> = {
  safe: "border-ok/30 bg-ok/5 text-ink",
  monitor: "border-accent/30 bg-accent-soft text-accent-ink",
  clinician_recommended: "border-warn/30 bg-warn/10 text-ink",
  urgent: "border-warn/60 bg-warn/15 text-ink",
};

export function AssessmentForm({ instrument }: { instrument: Instrument }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const allAnswered = instrument.items.every((it) => answers[it.id] !== undefined);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrumentId: instrument.id, answers }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not score this assessment.");
      } else {
        setResult(json);
        trackEvent("assessment_completed", {
          instrument: instrument.id,
          flag: json.result.flag,
        });
        // Browser-only: lets the Screening Companion pull results together.
        // Stores the scored summary, never the raw answers.
        recordResult({
          instrumentId: instrument.id,
          name: instrument.name,
          shortName: instrument.shortName,
          rawScore: json.result.rawScore,
          maxScore: json.result.maxScore,
          scoreSuffix: json.result.scoreSuffix,
          severityLabel: json.result.severityLabel,
          flag: json.result.flag,
          crisisSignal: !!json.result.crisisSignal,
          at: Date.now(),
        });
        // Best-effort save for signed-in users; never blocks the UI.
        // 401 just means the user isn't signed in — we silently ignore.
        const flags = [json.result.flag, json.result.crisisSignal ? "urgent" : null].filter(Boolean) as string[];
        fetch("/api/account/assessment-results", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instrumentId: instrument.id,
            rawScore: json.result.rawScore,
            severity: json.result.severityLabel,
            flags,
          }),
        }).catch(() => {});
        setTimeout(() => {
          document.getElementById("assessment-result")?.scrollIntoView({ behavior: "smooth" });
        }, 80);
      }
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return <ResultPanel result={result} onReset={() => { setResult(null); setAnswers({}); }} />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-ink-700 max-w-prose">{instrument.prompt}</p>

      <ol className="space-y-3">
        {instrument.items.map((item, idx) => (
          <li key={item.id} className="card p-4">
            <fieldset>
              <legend className="text-sm text-ink-900 font-medium">
                <span className="text-ink-400 mr-2">{idx + 1}.</span>
                {item.prompt}
              </legend>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {item.options.map((opt) => {
                  const selected = answers[item.id] === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={`cursor-pointer rounded-xl border px-3 py-2 text-sm transition-colors ${
                        selected
                          ? "border-accent bg-accent-soft text-accent-ink"
                          : "border-border bg-surface text-ink-700 hover:bg-elevated"
                      }`}
                    >
                      <input
                        type="radio"
                        name={item.id}
                        value={opt.value}
                        checked={selected}
                        onChange={() =>
                          setAnswers((a) => ({ ...a, [item.id]: opt.value }))
                        }
                        className="sr-only"
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>

      {error && (
        <div role="alert" className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 sticky bottom-2">
        <button type="submit" disabled={!allAnswered || submitting} className="btn-primary">
          {submitting ? "Scoring…" : "Score my answers"}
        </button>
        <span className="text-xs text-ink-400">
          {Object.keys(answers).length} of {instrument.items.length} answered · scored in
          your browser
        </span>
      </div>
    </form>
  );
}

function ResultPanel({ result, onReset }: { result: Response; onReset: () => void }) {
  const { result: r, name, citation } = result;
  const cls = FLAG_STYLES[r.flag];

  return (
    <div id="assessment-result" className={`rounded-2xl border p-5 ${cls} animate-fade-up`}>
      <p className="pill w-fit">{name}</p>
      <h2 className="mt-3 font-serif text-2xl text-ink-900">{r.severityLabel}</h2>
      <p className="mt-1 text-sm text-ink-600">
        Score: <strong>{r.rawScore}{r.scoreSuffix}</strong> / {r.maxScore}{r.scoreSuffix}
      </p>
      <p className="mt-3 text-ink-800 max-w-prose leading-relaxed">{r.interpretation}</p>
      <p className="mt-2 text-xs text-ink-400">
        This is an educational screening result, not a diagnosis or treatment.
      </p>

      {r.crisisSignal && (
        <div className="mt-4 rounded-xl border border-warn/50 bg-warn/15 p-3 text-sm text-ink">
          <strong>You are not alone.</strong> One of your answers indicates thoughts of
          self-harm. Please consider calling{" "}
          <a className="underline" href="tel:14416">Tele-MANAS (India · 14416)</a>,{" "}
          <a className="underline" href="tel:+919152987821">iCall (+91 9152 987 821)</a>,
          or your local crisis line. The Need-help-now button at the bottom right of the
          screen has more options.
        </div>
      )}

      {r.flag === "clinician_recommended" || r.flag === "urgent" ? (
        <a href="/clinicians" className="mt-4 inline-block btn-primary">
          Find a clinician →
        </a>
      ) : null}

      <details className="mt-4 text-xs text-ink-600">
        <summary className="cursor-pointer text-ink-400">Citation</summary>
        <p className="mt-2 italic">{citation}</p>
      </details>

      <div className="mt-5 flex flex-wrap gap-3">
        <a href="/assessments/reflection" className="btn-secondary">
          Get an AI reflection →
        </a>
        <button type="button" onClick={onReset} className="btn-ghost">
          Take it again
        </button>
        <a href="/assessments" className="btn-ghost">All assessments</a>
      </div>
    </div>
  );
}
