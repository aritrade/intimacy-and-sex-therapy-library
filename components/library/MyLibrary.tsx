"use client";

import Link from "next/link";
import { useMemo } from "react";
import { LibraryCard } from "./LibraryCard";
import type { LibItem } from "./types";
import { useExploredCount, useProgress, useSaved } from "./engagement";

/**
 * Personalized, localStorage-backed shelves: "Continue reading" (items with
 * partial progress) and "Saved". Renders nothing until there's something to
 * show, so first-time visitors see a clean page. Also surfaces a gentle
 * "explored N topics" nudge — value-first, never a manipulative streak.
 */
export function MyLibrary({ items }: { items: LibItem[] }) {
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const { recent, hydrated: pHydrated } = useProgress();
  const { ids: savedIds, hydrated: sHydrated } = useSaved();
  const explored = useExploredCount();

  if (!pHydrated || !sHydrated) return null;

  const continueItems = recent
    .map((p) => ({ item: byId.get(p.id), pct: p.pct }))
    .filter((x): x is { item: LibItem; pct: number } => !!x.item)
    .slice(0, 4);

  const savedItems = savedIds
    .map((id) => byId.get(id))
    .filter((x): x is LibItem => !!x)
    .slice(0, 8);

  if (continueItems.length === 0 && savedItems.length === 0 && explored === 0) {
    return null;
  }

  return (
    <section aria-labelledby="my-library" className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="my-library" className="font-serif text-2xl text-ink-900">
          Your shelf
        </h2>
        {explored > 0 && (
          <p className="text-sm text-ink-500">
            You&apos;ve explored {explored} topic{explored === 1 ? "" : "s"} — nicely done.
          </p>
        )}
      </div>

      {continueItems.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-400">
            Continue reading
          </h3>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {continueItems.map(({ item, pct }) => (
              <li key={item.id} className="space-y-2">
                <LibraryCard item={item} compact />
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.min(100, Math.max(4, pct))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {savedItems.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-400">
            Saved for later
          </h3>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {savedItems.map((item) => (
              <li key={item.id}>
                <LibraryCard item={item} compact />
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-ink-400">
        Your shelf lives only in this browser — nothing is uploaded.{" "}
        <Link href="/library/discover" className="underline">
          Discover something new
        </Link>
        .
      </p>
    </section>
  );
}
