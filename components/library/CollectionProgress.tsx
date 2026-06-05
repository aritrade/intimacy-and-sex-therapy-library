"use client";

import { useProgress } from "./engagement";

/**
 * Shows gentle "X of N read" progress for a collection, derived from
 * localStorage reading progress. Counts an item as read at ≥90% scroll.
 */
export function CollectionProgress({ ids }: { ids: string[] }) {
  const { map, hydrated } = useProgress();
  if (!hydrated || ids.length === 0) return null;

  const read = ids.filter((id) => (map[id]?.pct ?? 0) >= 90).length;
  const pct = Math.round((read / ids.length) * 100);

  return (
    <div className="mt-4 max-w-md">
      <div className="mb-1 flex items-center justify-between text-xs text-ink-500">
        <span>
          {read} of {ids.length} read
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
