"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CONCERN_OPTIONS,
  DEPTH_OPTIONS,
  RELATIONSHIP_OPTIONS,
  type ConcernId,
  type DepthId,
  type IntakeAnswers,
  type RelationshipId,
  clearIntake,
  readIntake,
  recommendFor,
  writeIntake,
} from "@/lib/personalize";

type Step = "intro" | "concern" | "relationship" | "depth" | "results";

/**
 * IntakeQuiz — a 30-second, privacy-first personalisation flow for the
 * home page. All answers live in `localStorage`; nothing is sent to the
 * server. The component is the only consumer of `lib/personalize` on
 * the client; the server doesn't see any of this.
 *
 * Render lifecycle:
 *   1. SSR / initial mount: shows a tiny "Personalise your library"
 *      teaser. We can't read localStorage during SSR, so we always
 *      start in this state and progressively reveal.
 *   2. After mount, if intake is already saved, jump to "results" and
 *      render the "Picked for you" shelf.
 *   3. If the user clicks "Start", we step through three questions and
 *      land on "results".
 *
 * Hydration safety: we gate everything that depends on storage behind
 * an `mounted` flag so the server-rendered shell matches the first
 * client paint.
 */
export function IntakeQuiz() {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("intro");
  const [concern, setConcern] = useState<ConcernId | null>(null);
  const [relationship, setRelationship] = useState<RelationshipId | null>(null);
  const [depth, setDepth] = useState<DepthId | null>(null);
  const [saved, setSaved] = useState<IntakeAnswers | null>(null);

  useEffect(() => {
    const existing = readIntake();
    if (existing) {
      setSaved(existing);
      setStep("results");
    }
    setMounted(true);
  }, []);

  function reset() {
    clearIntake();
    setSaved(null);
    setConcern(null);
    setRelationship(null);
    setDepth(null);
    setStep("intro");
  }

  function finish() {
    if (!concern || !relationship || !depth) return;
    const answers: IntakeAnswers = {
      concern,
      relationship,
      depth,
      completedAt: new Date().toISOString(),
    };
    writeIntake(answers);
    setSaved(answers);
    setStep("results");
  }

  // Pre-mount placeholder so SSR HTML matches the first client paint.
  if (!mounted) {
    return (
      <section className="container-page py-8">
        <div className="card p-5 text-sm text-ink-400">Loading personalisation…</div>
      </section>
    );
  }

  return (
    <section className="container-page py-10">
      <div className="card p-5 sm:p-6 animate-fade-up">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="pill-accent w-fit">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
              Personalise · 30 seconds
            </p>
            <h2 className="mt-3 font-serif text-2xl text-ink-900">
              {step === "results" ? "Picked for you" : "Help us help you find what's useful"}
            </h2>
          </div>
          {step === "results" && (
            <button
              type="button"
              onClick={reset}
              className="text-sm text-ink-500 hover:text-ink-900 underline-offset-4 hover:underline"
            >
              Reset
            </button>
          )}
        </header>

        {step === "intro" && (
          <div className="mt-4">
            <p className="text-sm text-ink-600 max-w-prose">
              Three quick questions. Your answers stay only in your browser — never
              uploaded, never tracked. Skippable any time.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setStep("concern")}
                className="btn-primary"
              >
                Start →
              </button>
              <Link href="/catalog" className="btn-ghost">
                Skip — just browse
              </Link>
            </div>
          </div>
        )}

        {step === "concern" && (
          <Question
            heading="What brings you here today?"
            subheading="Pick whatever feels closest. You can change this later."
            progress="1 / 3"
            onBack={() => setStep("intro")}
          >
            <Options
              name="concern"
              options={CONCERN_OPTIONS}
              value={concern}
              onChange={(v) => {
                setConcern(v as ConcernId);
                setStep("relationship");
              }}
            />
          </Question>
        )}

        {step === "relationship" && (
          <Question
            heading="How would you describe your relationship status?"
            subheading="So we can pin couples vs solo material when relevant."
            progress="2 / 3"
            onBack={() => setStep("concern")}
          >
            <Options
              name="relationship"
              options={RELATIONSHIP_OPTIONS}
              value={relationship}
              onChange={(v) => {
                setRelationship(v as RelationshipId);
                setStep("depth");
              }}
            />
          </Question>
        )}

        {step === "depth" && (
          <Question
            heading="How deep would you like to go?"
            subheading="We'll bias toward this level — you can still read anything."
            progress="3 / 3"
            onBack={() => setStep("relationship")}
          >
            <Options
              name="depth"
              options={DEPTH_OPTIONS}
              value={depth}
              onChange={(v) => {
                setDepth(v as DepthId);
                // Use rAF so the radio paints "checked" before we navigate.
                requestAnimationFrame(finish);
              }}
            />
          </Question>
        )}

        {step === "results" && saved && <Results answers={saved} onReset={reset} />}
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Sub-components — inlined here because they're tightly coupled to the quiz
// shape and not reused elsewhere. Splitting them into their own files would
// just add navigation overhead with no payoff.
// -----------------------------------------------------------------------------

function Question({
  heading,
  subheading,
  progress,
  onBack,
  children,
}: {
  heading: string;
  subheading: string;
  progress: string;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-4 text-xs text-ink-400">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="hover:text-ink-900 underline-offset-4 hover:underline"
          >
            ← Back
          </button>
        ) : (
          <span />
        )}
        <span aria-live="polite">{progress}</span>
      </div>
      <h3 className="mt-3 font-serif text-xl text-ink-900">{heading}</h3>
      <p className="mt-1 text-sm text-ink-600">{subheading}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

type Option<T extends string> = { id: T; label: string; hint?: string };

function Options<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: Array<Option<T>>;
  value: T | null;
  onChange: (id: T) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{name}</legend>
      <ul className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const selected = value === o.id;
          return (
            <li key={o.id}>
              <label
                className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border p-3 text-sm transition-colors ${
                  selected
                    ? "border-accent/60 bg-accent-soft text-accent-ink"
                    : "border-border bg-surface text-ink-700 hover:bg-elevated"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={name}
                    value={o.id}
                    checked={selected}
                    onChange={() => onChange(o.id)}
                    className="h-4 w-4 accent-accent-ink"
                  />
                  <span className="font-medium">{o.label}</span>
                </span>
                {o.hint && (
                  <span className="ml-6 text-xs text-ink-400">{o.hint}</span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

function Results({
  answers,
  onReset,
}: {
  answers: IntakeAnswers;
  onReset: () => void;
}) {
  const recs = recommendFor(answers);
  const concernLabel =
    CONCERN_OPTIONS.find((o) => o.id === answers.concern)?.label ?? "your topic";

  return (
    <div className="mt-4">
      <p className="text-sm text-ink-600 max-w-prose">
        Based on <strong>{concernLabel}</strong>. Tap any chip to dive in.
      </p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {recs.map((r) => (
          <li key={r.href}>
            <Link
              href={r.href}
              className="pill hover:border-accent/60 hover:bg-accent-soft hover:text-accent-ink transition-colors"
            >
              {r.label} →
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
        <Link href="/catalog" className="btn-secondary">
          Browse the full catalog
        </Link>
        <Link href="/companion" className="btn-ghost">
          Talk to Sahay
        </Link>
        <button
          type="button"
          onClick={onReset}
          className="text-ink-400 hover:text-ink-900 underline-offset-4 hover:underline"
        >
          Retake the quiz
        </button>
      </div>
    </div>
  );
}
