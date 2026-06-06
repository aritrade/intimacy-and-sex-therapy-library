"use client";

import { useState } from "react";
import Link from "next/link";
import { useStoredResults, clearResults, type StoredResult } from "./results-store";
import { trackEvent } from "@/components/Analytics";

type ReflectionRead = { title: string; slug: string; why: string };
type Reflection = {
  summary: Array<{ name: string; line: string; flag: StoredResult["flag"] }>;
  patterns: string[];
  directions: string[];
  clinicianSuggestion: string | null;
  encouragement: string | null;
  reads: ReflectionRead[];
  crisis: boolean;
  llm: boolean;
};

const FLAG_DOT: Record<StoredResult["flag"], string> = {
  safe: "bg-ok",
  monitor: "bg-accent",
  clinician_recommended: "bg-warn",
  urgent: "bg-warn",
};

export function ReflectionPanel() {
  const stored = useStoredResults();
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reflection, setReflection] = useState<Reflection | null>(null);

  const selected = stored.filter((r) => !excluded.has(r.instrumentId));

  function toggle(id: string) {
    setExcluded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/screening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results: selected.map((r) => ({
            instrumentId: r.instrumentId,
            rawScore: r.rawScore,
            maxScore: r.maxScore,
            scoreSuffix: r.scoreSuffix,
            severityLabel: r.severityLabel,
            flag: r.flag,
            crisisSignal: r.crisisSignal,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.detail ?? json.error ?? "Could not generate a reflection.");
      } else {
        setReflection(json as Reflection);
        trackEvent("screening_reflection_generated", { count: selected.length });
        setTimeout(() => document.getElementById("reflection-out")?.scrollIntoView({ behavior: "smooth" }), 80);
      }
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setLoading(false);
    }
  }

  if (stored.length === 0) {
    return (
      <div className="card p-6">
        <h2 className="font-serif text-xl text-ink-900">No assessments completed yet</h2>
        <p className="mt-2 text-ink-600 max-w-prose">
          Complete one or more self-assessments and your results will appear here (privately, in
          your browser). Then I can pull them together into a plain-language reflection.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/assessments/triage" className="btn-primary">Find my assessments →</Link>
          <Link href="/assessments" className="btn-ghost">Browse all</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="font-serif text-xl text-ink-900">Your completed assessments</h2>
        <p className="mt-1 text-sm text-ink-500">
          These are stored only in this browser. Uncheck any you’d like to leave out.
        </p>
        <ul className="mt-4 space-y-2">
          {stored.map((r) => (
            <li key={r.instrumentId}>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2">
                <input
                  type="checkbox"
                  checked={!excluded.has(r.instrumentId)}
                  onChange={() => toggle(r.instrumentId)}
                  className="h-4 w-4 accent-accent"
                />
                <span className={`h-2.5 w-2.5 rounded-full ${FLAG_DOT[r.flag]}`} aria-hidden />
                <span className="flex-1 text-sm text-ink-900">{r.shortName}</span>
                <span className="text-sm text-ink-600">{r.severityLabel}</span>
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={generate}
            disabled={loading || selected.length === 0}
            className="btn-primary"
          >
            {loading ? "Reflecting…" : "Generate my reflection"}
          </button>
          <button
            type="button"
            onClick={() => {
              clearResults();
              setReflection(null);
            }}
            className="btn-ghost text-sm"
          >
            Clear my results
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
            {error}
          </p>
        )}
      </div>

      {reflection && <Output reflection={reflection} />}
    </div>
  );
}

function Output({ reflection: r }: { reflection: Reflection }) {
  return (
    <div id="reflection-out" className="card p-6 animate-fade-up">
      <p className="text-xs uppercase tracking-wider text-accent-ink font-semibold">
        Educational screening reflection — not a diagnosis or treatment
      </p>

      {r.crisis && (
        <div className="mt-4 rounded-xl border border-warn/50 bg-warn/15 p-3 text-sm text-ink">
          <strong>Please reach out for support now.</strong> Some responses suggest you may be in
          distress. You can call{" "}
          <a className="underline" href="tel:14416">Tele-MANAS (India · 14416)</a> or{" "}
          <a className="underline" href="tel:+919152987821">iCall (+91 9152 987 821)</a>. The
          Need-help-now button (bottom right) has more options. You deserve support.
        </div>
      )}

      <section className="mt-5">
        <h3 className="font-serif text-lg text-ink-900">What your responses show</h3>
        <ul className="mt-2 space-y-1.5">
          {r.summary.map((s, i) => (
            <li key={i} className="flex items-baseline gap-2 text-sm">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${FLAG_DOT[s.flag]}`} aria-hidden />
              <span className="text-ink-700"><strong className="text-ink-900">{s.name}:</strong> {s.line}</span>
            </li>
          ))}
        </ul>
      </section>

      {r.patterns.length > 0 && (
        <section className="mt-5">
          <h3 className="font-serif text-lg text-ink-900">Patterns worth exploring</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">
            {r.patterns.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </section>
      )}

      {r.directions.length > 0 && (
        <section className="mt-5">
          <h3 className="font-serif text-lg text-ink-900">Evidence-informed next steps</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">
            {r.directions.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </section>
      )}

      {r.reads.length > 0 && (
        <section className="mt-5">
          <h3 className="font-serif text-lg text-ink-900">Suggested reading</h3>
          <ul className="mt-2 space-y-2">
            {r.reads.map((rd) => (
              <li key={rd.slug}>
                <Link href={`/resource/${rd.slug}`} className="text-sm text-accent-ink underline hover:no-underline">
                  {rd.title}
                </Link>
                {rd.why && <span className="text-sm text-ink-500"> — {rd.why}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-5 rounded-xl border border-accent/30 bg-accent-soft p-4">
        {r.clinicianSuggestion && (
          <p className="text-sm text-accent-ink">{r.clinicianSuggestion}</p>
        )}
        <Link href="/clinicians" className="mt-3 inline-block btn-primary">Find a clinician →</Link>
      </section>

      {r.encouragement && (
        <p className="mt-5 text-ink-700 italic">{r.encouragement}</p>
      )}

      {!r.llm && (
        <p className="mt-5 text-xs text-ink-400">
          The AI synthesis is currently unavailable, so this shows your validated score bands and
          relevant reading. The score interpretations above are still accurate.
        </p>
      )}

      <p className="mt-5 text-xs text-ink-400">
        This reflection is generated to support understanding and is not a substitute for
        assessment by a qualified clinician.
      </p>
    </div>
  );
}
