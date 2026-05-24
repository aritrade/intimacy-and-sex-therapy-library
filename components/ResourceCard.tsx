import Link from "next/link";
import type { CatalogItem } from "@/lib/db/queries";

const DIFFICULTY: Record<string, { label: string; cls: string }> = {
  beginner: { label: "Beginner", cls: "pill-teal" },
  intermediate: { label: "Intermediate", cls: "pill-plum" },
  advanced: { label: "Advanced", cls: "pill-coral" },
};

const TIER_LABEL: Record<string, string> = {
  tier_1: "Tier 1",
  tier_2: "Tier 2",
  tier_3: "Tier 3",
};

export function ResourceCard({ item }: { item: CatalogItem }) {
  const difficulty = item.tagNames.find((n) =>
    ["beginner", "intermediate", "advanced"].includes(n),
  );
  const topics = item.tagNames
    .filter((n) => !["beginner", "intermediate", "advanced"].includes(n))
    .slice(0, 3);
  const diff = difficulty ? DIFFICULTY[difficulty] : undefined;

  return (
    <article className="card card-hover group p-5 flex flex-col">
      <header className="flex flex-wrap items-center gap-1.5 text-xs">
        {diff && <span className={diff.cls}>{diff.label}</span>}
        <span className="pill-accent">{TIER_LABEL[item.source.tier] ?? item.source.tier}</span>
        <span className="text-ink-400 ml-auto truncate max-w-[10rem]">{item.source.name}</span>
      </header>
      <h3 className="mt-3 font-serif text-lg text-ink-900 leading-snug">
        <Link
          href={`/resource/${item.slug}`}
          className="group-hover:text-accent-ink transition-colors"
        >
          {item.title}
        </Link>
      </h3>
      {item.authors.length > 0 && (
        <p className="mt-1 text-sm text-ink-600 line-clamp-1">
          {item.authors.slice(0, 4).join(", ")}
        </p>
      )}
      {item.summary && (
        <p className="mt-2 text-sm text-ink-600 line-clamp-3 flex-1">{item.summary}</p>
      )}
      {topics.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {topics.map((t) => (
            <li key={t}>
              <span className="pill">{t.replace(/_/g, " ")}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
