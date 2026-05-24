"use client";

import type { Message } from "ai";
import { useMemo } from "react";

type Citation = {
  n: number;
  title: string;
  authors: string[];
  year: number | null;
  source: string;
  url: string;
  slug: string;
  page: number | null;
  timestamp: number | null;
  matchedBy: ("vector" | "bm25")[];
};

function extractCitations(messages: Message[]): Citation[] {
  const all: Citation[] = [];
  const seen = new Set<string>();

  for (const m of messages) {
    const invs = (m as unknown as { toolInvocations?: Array<{ toolName: string; result?: unknown }> }).toolInvocations;
    if (!invs) continue;
    for (const inv of invs) {
      if (inv.toolName !== "searchCorpus") continue;
      const result = inv.result as Citation[] | undefined;
      if (!Array.isArray(result)) continue;
      for (const r of result) {
        if (!r?.url || seen.has(r.url)) continue;
        seen.add(r.url);
        all.push(r);
      }
    }
  }
  return all.map((c, i) => ({ ...c, n: i + 1 }));
}

export function CitationList({ messages }: { messages: Message[] }) {
  const citations = useMemo(() => extractCitations(messages), [messages]);

  if (citations.length === 0) {
    return (
      <aside aria-label="Sources" className="card p-4 text-sm text-ink-400 h-fit">
        <h2 className="font-medium text-ink-900 mb-1">Sources</h2>
        Sources cited by the chatbot will appear here.
      </aside>
    );
  }

  return (
    <aside aria-label="Sources" className="card p-4 text-sm text-ink-700 h-fit lg:sticky lg:top-20">
      <h2 className="font-medium text-ink-900 mb-3">Sources</h2>
      <ol className="space-y-3">
        {citations.map((c) => (
          <li key={c.url} className="leading-snug">
            <span className="font-mono text-xs text-ink-400">[{c.n}]</span>{" "}
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent-ink hover:underline"
            >
              {c.title}
            </a>
            <div className="text-xs text-ink-600 mt-0.5">
              {c.authors.length > 0 ? c.authors.slice(0, 3).join(", ") : "Unknown authors"}
              {c.year ? ` · ${c.year}` : ""}
              {" · "}
              {c.source}
              {c.page != null ? ` · p.${c.page}` : ""}
              {c.timestamp != null ? ` · ${formatTimestamp(c.timestamp)}` : ""}
            </div>
            <div className="text-[11px] text-ink-400">
              matched: {c.matchedBy.join(" + ")} ·{" "}
              <a className="hover:text-ink-900 underline-offset-2 hover:underline" href={`/resource/${c.slug}`}>
                resource page
              </a>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
