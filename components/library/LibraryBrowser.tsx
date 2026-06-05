"use client";

import { useMemo, useState } from "react";
import { LibraryCard } from "./LibraryCard";
import { KIND_LABEL, type LibItem } from "./types";
import { isTopicTag, topicLabel } from "@/lib/library/collections";

const KIND_ORDER = ["article", "book", "guideline", "worksheet", "video"] as const;

/**
 * Full browse experience: free-text filter + kind tabs over the whole library.
 * Filtering is client-side over the already-loaded set (fast, no round-trips).
 * For deeper / live discovery the hero search box points at /library/discover.
 */
export function LibraryBrowser({ items }: { items: LibItem[] }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const it of items) c[it.kind] = (c[it.kind] ?? 0) + 1;
    return c;
  }, [items]);

  const kindsPresent = useMemo(
    () => KIND_ORDER.filter((k) => (counts[k] ?? 0) > 0),
    [counts],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      if (kind !== "all" && it.kind !== kind) return false;
      if (!needle) return true;
      const hay = [
        it.title,
        it.summary ?? "",
        it.authors.join(" "),
        it.sourceName,
        it.tagNames.filter(isTopicTag).map(topicLabel).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q, kind]);

  return (
    <section aria-labelledby="lib-browse">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="lib-browse" className="font-serif text-2xl text-ink-900">
          Browse everything
        </h2>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter this list…"
          className="w-full max-w-xs rounded-full border border-ink-200 bg-surface px-4 py-2 text-sm focus:border-accent/50 focus:outline-none"
        />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <Tab label="All" count={counts.all} active={kind === "all"} onClick={() => setKind("all")} />
        {kindsPresent.map((k) => (
          <Tab
            key={k}
            label={`${KIND_LABEL[k] ?? k}s`}
            count={counts[k]}
            active={kind === k}
            onClick={() => setKind(k)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="card p-6 text-sm text-ink-600">
          Nothing matches “{q}”.{" "}
          <a href={`/library/discover?q=${encodeURIComponent(q)}`} className="text-accent-ink underline">
            Ask Discover to find it
          </a>{" "}
          across the open research web.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((it) => (
            <li key={it.id}>
              <LibraryCard item={it} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Tab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number | undefined;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm transition ${
        active
          ? "border-accent/50 bg-accent/10 text-accent-ink"
          : "border-ink-200 text-ink-600 hover:border-accent/30 hover:bg-elevated"
      }`}
    >
      {label}
      {count != null && <span className="ml-1.5 text-xs text-ink-400">{count}</span>}
    </button>
  );
}
