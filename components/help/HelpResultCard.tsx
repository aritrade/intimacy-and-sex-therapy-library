"use client";

import { useState } from "react";

export type HelpResultView = {
  ref: string;
  name: string;
  kind: "clinician" | "community";
  platform: string | null;
  area: string | null;
  rating: number | null;
  reviews: number | null;
  url: string;
  tags: string[];
  why: string;
  source: "places" | "web";
};

const PLATFORM_LABEL: Record<string, string> = {
  reddit: "Reddit",
  facebook: "Facebook group",
  discord: "Discord",
  meetup: "Meetup",
  local: "Local",
  web: "Online",
};

export function HelpResultCard({ result }: { result: HelpResultView }) {
  const [reported, setReported] = useState(false);
  const [busy, setBusy] = useState(false);

  async function report() {
    if (busy || reported) return;
    setBusy(true);
    try {
      await fetch("/api/help/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: result.ref, reason: "user_report" }),
      });
      setReported(true);
    } catch {
      /* fail soft */
    } finally {
      setBusy(false);
    }
  }

  const platform = result.platform ? PLATFORM_LABEL[result.platform] ?? result.platform : null;

  return (
    <article className="card card-hover p-5 h-full flex flex-col">
      <div className="flex flex-wrap items-center gap-1.5">
        {platform && <span className="pill-plum">{platform}</span>}
        {typeof result.rating === "number" && (
          <span className="pill" title={`${result.reviews ?? 0} reviews`}>
            ★ {result.rating.toFixed(1)}
            {result.reviews ? ` (${result.reviews})` : ""}
          </span>
        )}
        {result.tags.slice(0, 3).map((t) => (
          <span key={t} className="pill-teal">
            {t}
          </span>
        ))}
      </div>

      <h3 className="mt-3 font-serif text-lg text-ink-900">{result.name}</h3>
      {result.area && <p className="mt-1 text-xs text-ink-400">{result.area}</p>}
      {result.why && <p className="mt-2 text-sm text-ink-700">{result.why}</p>}

      <div className="mt-4 flex items-center gap-3">
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="btn-secondary self-start"
        >
          {result.kind === "clinician" ? "View listing" : "Visit community"}
        </a>
        <button
          type="button"
          onClick={report}
          disabled={busy || reported}
          className="text-xs text-ink-400 hover:text-ink-700 underline disabled:no-underline"
        >
          {reported ? "Reported — thank you" : "Report"}
        </button>
      </div>
    </article>
  );
}
