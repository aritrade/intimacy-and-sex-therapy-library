"use client";

import { useSaved } from "./engagement";

/** Heart toggle that persists a saved library item to localStorage. */
export function SaveButton({ id, className = "" }: { id: string; className?: string }) {
  const { isSaved, toggle, hydrated } = useSaved();
  const saved = hydrated && isSaved(id);

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save for later"}
      title={saved ? "Saved — click to remove" : "Save for later"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(id);
      }}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-base transition ${
        saved
          ? "border-coral/40 bg-coral/10 text-coral"
          : "border-ink-200 text-ink-400 hover:border-accent/40 hover:text-accent-ink"
      } ${className}`}
    >
      {saved ? "♥" : "♡"}
    </button>
  );
}
