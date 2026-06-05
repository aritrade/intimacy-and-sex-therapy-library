import { LibraryCard } from "./LibraryCard";
import type { LibItem } from "./types";

/** "Go deeper" rail of related resources. Renders nothing when empty. */
export function RelatedReading({ items, title = "Go deeper" }: { items: LibItem[]; title?: string }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="related" className="mt-10">
      <h2 id="related" className="mb-3 font-serif text-2xl text-ink-900">
        {title}
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <li key={it.id}>
            <LibraryCard item={it} />
          </li>
        ))}
      </ul>
    </section>
  );
}
