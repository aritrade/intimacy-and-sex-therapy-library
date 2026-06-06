"use client";

import { useEffect, useMemo, useState } from "react";
import { trackEvent } from "@/components/Analytics";

export type MythEntry = {
  id: string;
  myth: string;
  context_in?: string;
  fact: string;
  what_helps?: string;
  sources?: string[];
};

type Card = { entry: MythEntry; text: string; isMyth: boolean };

function firstSentences(text: string, max = 220): string {
  const parts = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  let out = "";
  for (const p of parts) {
    if ((out + p).length > max && out.length > 0) break;
    out += p;
  }
  return out.trim() || text.slice(0, max);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(entries: MythEntry[]): Card[] {
  return shuffle(
    entries.map((entry) =>
      Math.random() < 0.5
        ? { entry, text: entry.myth, isMyth: true }
        : { entry, text: firstSentences(entry.fact), isMyth: false },
    ),
  );
}

export function MythGame({ entries }: { entries: MythEntry[] }) {
  const [deck, setDeck] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<null | "myth" | "fact">(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    setDeck(buildDeck(entries));
  }, [entries]);

  const card = deck[idx];
  const correct = picked != null && card && (picked === "myth") === card.isMyth;

  function answer(choice: "myth" | "fact") {
    if (picked || !card) return;
    setPicked(choice);
    const right = (choice === "myth") === card.isMyth;
    if (right) {
      setScore((s) => s + 1);
      setStreak((s) => {
        const n = s + 1;
        setBest((b) => Math.max(b, n));
        return n;
      });
    } else {
      setStreak(0);
    }
  }

  function next() {
    if (idx + 1 >= deck.length) {
      setFinished(true);
      trackEvent("myth_game_completed", { score, total: deck.length, best });
      return;
    }
    setIdx((i) => i + 1);
    setPicked(null);
  }

  function restart() {
    setDeck(buildDeck(entries));
    setIdx(0);
    setPicked(null);
    setScore(0);
    setStreak(0);
    setBest(0);
    setFinished(false);
  }

  const progressPct = useMemo(
    () => (deck.length ? Math.round(((idx + (picked ? 1 : 0)) / deck.length) * 100) : 0),
    [idx, picked, deck.length],
  );

  if (deck.length === 0) {
    return <div className="card p-6 text-sm text-ink-500">Loading…</div>;
  }

  if (finished) {
    const pct = Math.round((score / deck.length) * 100);
    const msg =
      pct >= 80 ? "Myth-busting pro. You see through the noise." :
      pct >= 50 ? "Solid instincts — and a few surprises to take with you." :
      "Plenty of myths out there. Now you’ve got the facts.";
    return (
      <div className="card p-6 text-center animate-fade-up">
        <p className="pill-accent mx-auto w-fit">Round complete</p>
        <p className="mt-4 font-serif text-4xl text-ink-900">{score}/{deck.length}</p>
        <p className="mt-1 text-sm text-ink-500">Best streak: {best}</p>
        <p className="mt-3 text-ink-700 max-w-prose mx-auto">{msg}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={restart} className="btn-primary">Play again</button>
          <a href="#all-myths" className="btn-ghost">Read all the facts</a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-sm text-ink-500">
        <span>Question {idx + 1} of {deck.length}</span>
        <span className="flex items-center gap-3">
          <span>Score {score}</span>
          {streak >= 2 && <span className="pill-accent">🔥 {streak} streak</span>}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated" aria-hidden>
        <div className="h-full bg-accent transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="card mt-5 p-6">
        <p className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
          Myth or fact?
        </p>
        <p className="mt-3 font-serif text-xl text-ink-900 leading-snug">“{card.text}”</p>
        {card.entry.context_in && !picked && (
          <p className="mt-3 text-sm text-ink-400">Where you might hear it: {card.entry.context_in}</p>
        )}

        {!picked ? (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => answer("myth")} className="btn-secondary py-3">
              It’s a myth
            </button>
            <button type="button" onClick={() => answer("fact")} className="btn-secondary py-3">
              It’s a fact
            </button>
          </div>
        ) : (
          <div className="mt-5 animate-fade-up">
            <div
              className={`rounded-xl border p-3 ${
                correct ? "border-ok/40 bg-ok/10" : "border-warn/40 bg-warn/10"
              }`}
            >
              <p className="text-sm font-semibold text-ink-900">
                {correct ? "Correct!" : "Not quite."} That statement is{" "}
                {card.isMyth ? "a myth." : "a fact."}
              </p>
            </div>

            <div className="mt-3 rounded-xl border border-border bg-surface p-3">
              <p className="text-[11px] uppercase tracking-wider text-ok font-semibold">The evidence</p>
              <p className="mt-1 text-ink-800 text-sm leading-relaxed">{card.entry.fact}</p>
              {card.entry.what_helps && (
                <p className="mt-2 text-sm text-accent-ink">
                  <strong>What helps:</strong> {card.entry.what_helps}
                </p>
              )}
            </div>

            <button type="button" onClick={next} className="btn-primary mt-4">
              {idx + 1 >= deck.length ? "See my score" : "Next →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
