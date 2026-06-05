import Link from "next/link";
import { SaveButton } from "./SaveButton";
import { topicLabel, isTopicTag } from "@/lib/library/collections";
import { KIND_LABEL, KIND_PILL, type LibItem } from "./types";

/**
 * Presentational library card. Kept free of server-only imports so it can be
 * rendered from both server pages and client components (search, shelves).
 */
export function LibraryCard({ item, compact = false }: { item: LibItem; compact?: boolean }) {
  const topics = item.tagNames.filter(isTopicTag).slice(0, 3);

  return (
    <article
      className={`card card-hover group relative flex h-full flex-col ${compact ? "p-4" : "p-5"}`}
    >
      <div className="absolute right-3 top-3">
        <SaveButton id={item.id} />
      </div>

      <div className="flex items-center gap-2 pr-9">
        <span className={`${KIND_PILL[item.kind] ?? "pill"} w-fit`}>
          {KIND_LABEL[item.kind] ?? item.kind}
        </span>
        {item.readTimeMin != null && (
          <span className="text-xs text-ink-400">{item.readTimeMin} min read</span>
        )}
      </div>

      <h3 className="mt-3 font-serif text-base leading-snug text-ink-900 group-hover:text-accent-ink">
        <Link href={item.href} className="after:absolute after:inset-0">
          {item.title}
        </Link>
      </h3>

      {item.authors.length > 0 && (
        <p className="mt-1 line-clamp-1 text-sm text-ink-600">
          {item.authors.slice(0, 3).join(", ")}
        </p>
      )}

      {!compact && item.summary && (
        <p className="mt-2 line-clamp-3 flex-1 text-sm text-ink-600">{item.summary}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {topics.map((t) => (
          <span key={t} className="pill text-[11px]">
            {topicLabel(t)}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-ink-400">
        <span className="truncate">{item.sourceName}</span>
        {item.readableInline ? (
          <span className="text-accent-ink">Read here →</span>
        ) : (
          <span>Details →</span>
        )}
      </div>
    </article>
  );
}
