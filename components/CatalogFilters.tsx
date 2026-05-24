import Link from "next/link";
import { DIFFICULTY, MODALITIES, POPULATIONS, TOPICS } from "@/lib/ingest/topics";

type ActiveFilters = {
  topic?: string;
  difficulty?: string;
  population?: string;
  modality?: string;
  q?: string;
};

type Counts = {
  topic?: Record<string, number>;
  difficulty?: Record<string, number>;
  population?: Record<string, number>;
  modality?: Record<string, number>;
};

function buildHref(active: ActiveFilters, key: keyof ActiveFilters, value: string | undefined) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(active)) {
    if (k === key || !v) continue;
    params.set(k, v);
  }
  if (value !== undefined) params.set(key, value);
  const qs = params.toString();
  return `/catalog${qs ? `?${qs}` : ""}`;
}

export function CatalogFilters({
  active,
  counts,
}: {
  active: ActiveFilters;
  counts?: Counts;
}) {
  return (
    <aside aria-label="Catalog filters" className="text-sm">
      <FilterGroup
        label="Difficulty"
        options={DIFFICULTY.map((d) => ({ value: d, label: d }))}
        active={active}
        param="difficulty"
        counts={counts?.difficulty}
      />
      <FilterGroup
        label="Topic"
        options={Object.entries(TOPICS).map(([value, label]) => ({ value, label }))}
        active={active}
        param="topic"
        compact
        counts={counts?.topic}
      />
      <FilterGroup
        label="Population"
        options={Object.entries(POPULATIONS).map(([value, label]) => ({ value, label }))}
        active={active}
        param="population"
        counts={counts?.population}
      />
      <FilterGroup
        label="Modality"
        options={Object.entries(MODALITIES).map(([value, label]) => ({ value, label }))}
        active={active}
        param="modality"
        compact
        counts={counts?.modality}
      />
    </aside>
  );
}

function FilterGroup({
  label,
  options,
  active,
  param,
  compact,
  counts,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  active: ActiveFilters;
  param: keyof ActiveFilters;
  compact?: boolean;
  counts?: Record<string, number>;
}) {
  const current = active[param];

  // If we have count data, sort: items with resources first (desc by count),
  // then empty ones at the bottom. Empty items are still listed but rendered
  // disabled, so users can see the full taxonomy and what's coming.
  const decorated = options
    .map((o) => ({ ...o, count: counts ? counts[o.value] ?? 0 : undefined }))
    .sort((a, b) => {
      if (counts === undefined) return 0;
      const ca = a.count ?? 0;
      const cb = b.count ?? 0;
      if (ca === cb) return a.label.localeCompare(b.label);
      return cb - ca;
    });

  return (
    <fieldset className="mb-6">
      <legend className="font-medium text-ink-900 mb-2 flex items-center justify-between gap-2 w-full">
        <span>{label}</span>
        {current && (
          <Link
            href={buildHref(active, param, undefined)}
            className="text-xs text-ink-400 hover:text-ink-900 underline-offset-2 hover:underline"
          >
            clear
          </Link>
        )}
      </legend>
      <ul className={`flex flex-wrap gap-1.5 ${compact ? "max-h-56 overflow-y-auto pr-1" : ""}`}>
        {decorated.map((o) => {
          const count = o.count;
          const isEmpty = counts !== undefined && (count ?? 0) === 0;
          const isActive = current === o.value;

          // Render disabled chip for empty (so users see "this topic has 0 resources").
          if (isEmpty && !isActive) {
            return (
              <li key={o.value}>
                <span
                  className="pill cursor-not-allowed opacity-40"
                  aria-disabled="true"
                  title="No published resources yet for this filter."
                >
                  {o.label.replace(/_/g, " ")}
                  <span className="ml-1 text-[10px] text-ink-400">0</span>
                </span>
              </li>
            );
          }

          return (
            <li key={o.value}>
              <Link
                href={buildHref(active, param, o.value)}
                className={`pill transition-colors ${
                  isActive
                    ? "border-accent/50 bg-accent-soft text-accent-ink"
                    : "hover:border-accent/30 hover:bg-elevated"
                }`}
              >
                {o.label.replace(/_/g, " ")}
                {count !== undefined && count > 0 && (
                  <span className="ml-1 text-[10px] text-ink-400">{count}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
