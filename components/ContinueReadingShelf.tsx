"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "stl_recent_v1";

type Stub = { id: string; slug: string; title: string; kind: string; ts: number };

const KIND_LABEL: Record<string, string> = {
  article: "Article",
  book: "Book",
  guideline: "Guideline",
  worksheet: "Worksheet",
  video: "Video",
  report: "Report",
};

/**
 * Renders a "Continue reading" shelf if the user has any local history.
 * No network, no cookie — entirely localStorage. Hidden on first visit.
 */
export function ContinueReadingShelf() {
  const [items, setItems] = useState<Stub[] | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      const list: Stub[] = raw ? JSON.parse(raw) : [];
      setItems(list.slice(0, 6));
    } catch {
      setItems([]);
    }
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <section className="container-page py-8" aria-labelledby="continue-heading">
      <header className="mb-4 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 id="continue-heading" className="font-serif text-2xl text-ink-900">
            Continue where you left off
          </h2>
          <p className="text-sm text-ink-400">
            Local to this device. We don&apos;t track you across visits.
          </p>
        </div>
        <button
          onClick={() => {
            try {
              window.localStorage.removeItem(KEY);
            } catch {}
            setItems([]);
          }}
          className="text-xs text-ink-400 hover:text-ink-900 underline-offset-2 hover:underline"
        >
          Clear history
        </button>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <li key={it.id}>
            <Link
              href={`/resource/${it.slug}`}
              className="card card-hover p-4 flex items-start gap-3"
            >
              <span className="pill-accent text-[10px] mt-0.5">
                {KIND_LABEL[it.kind] ?? it.kind}
              </span>
              <span className="font-serif text-sm text-ink-900 line-clamp-2 flex-1">
                {it.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
