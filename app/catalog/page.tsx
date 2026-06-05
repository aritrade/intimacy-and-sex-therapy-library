import Link from "next/link";
import { CatalogFilters } from "@/components/CatalogFilters";
import { ResourceCard } from "@/components/ResourceCard";
import { countResourcesByTag, listCatalog } from "@/lib/db/queries";

export const metadata = { title: "Catalog · Intimacy & Sex Therapy Library" };
export const dynamic = "force-dynamic";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const get = (k: string) =>
    typeof searchParams[k] === "string" ? (searchParams[k] as string) : undefined;

  const filters = {
    topic: get("topic"),
    difficulty: get("difficulty"),
    population: get("population"),
    modality: get("modality"),
    kind: get("kind"),
    q: get("q"),
  };

  const hasFilters = !!(
    filters.topic ||
    filters.difficulty ||
    filters.population ||
    filters.modality ||
    filters.kind ||
    filters.q
  );

  const [items, topicCounts, difficultyCounts, populationCounts, modalityCounts] =
    await Promise.all([
      listCatalog(filters),
      countResourcesByTag("topic"),
      countResourcesByTag("difficulty"),
      countResourcesByTag("population"),
      countResourcesByTag("modality"),
    ]);

  return (
    <div className="container-page py-10">
      <header className="mb-8 max-w-3xl">
        <p className="pill-accent w-fit">Catalog · Advanced filters</p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">
          Filter the library precisely
        </h1>
        <p className="mt-2 text-ink-600">
          The power-user view of the{" "}
          <Link href="/library" className="text-accent-ink hover:underline">
            Library
          </Link>
          : filter every curated resource by topic, reading level, population, and modality.
          Sources are allowlisted institutions — AASECT, WPATH, WHO, NIH, peer-reviewed
          journals, accredited universities.
        </p>
        <p className="mt-3 text-sm text-ink-400">
          Want to read, explore journeys, or research a topic with AI?{" "}
          <Link href="/library" className="text-accent-ink hover:underline">
            Go to the Library &amp; Discover hub →
          </Link>
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        <CatalogFilters
          active={filters}
          counts={{
            topic: topicCounts.counts,
            difficulty: difficultyCounts.counts,
            population: populationCounts.counts,
            modality: modalityCounts.counts,
          }}
        />

        <section aria-label="Catalog results">
          <div className="mb-3 flex items-center justify-between text-sm text-ink-400">
            <span>
              {items.length} {items.length === 1 ? "result" : "results"}
              {hasFilters && topicCounts.totalPublished > 0 && (
                <> &middot; {topicCounts.totalPublished} total in catalog</>
              )}
            </span>
          </div>
          {items.length === 0 ? (
            <EmptyState
              hasFilters={hasFilters}
              totalPublished={topicCounts.totalPublished}
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {items.map((it) => (
                <li key={it.id}>
                  <ResourceCard item={it} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function EmptyState({
  hasFilters,
  totalPublished,
}: {
  hasFilters: boolean;
  totalPublished: number;
}) {
  const dbConfigured = !!process.env.DATABASE_URL;

  if (!dbConfigured) {
    return (
      <div className="card p-8 text-sm text-ink-600">
        <h2 className="font-serif text-xl text-ink-900 mb-2">Catalog not configured</h2>
        <p>
          <code className="text-ink-800">DATABASE_URL</code> is not set. Configure it in{" "}
          <code className="text-ink-800">.env</code>, then run{" "}
          <code className="text-ink-800">npm run db:migrate</code> and{" "}
          <code className="text-ink-800">npm run db:seed-all</code>.
        </p>
      </div>
    );
  }

  // DB is configured AND has resources — empty result is from filtering.
  if (hasFilters && totalPublished > 0) {
    return (
      <div className="card p-8 text-sm text-ink-600">
        <h2 className="font-serif text-xl text-ink-900 mb-2">
          No resources match these filters
        </h2>
        <p className="mb-4">
          The catalog has <strong className="text-ink-900">{totalPublished}</strong>{" "}
          published resources, but none of them are tagged with this exact combination.
          Try a different topic or relax one of the filters.
        </p>
        <Link
          href="/catalog"
          className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-3 py-1.5 text-ink-900 hover:bg-elevated"
        >
          Clear all filters
        </Link>
        <p className="mt-4 text-xs text-ink-400">
          Tip: filter chips below the count show how many resources each topic has — only
          topics with at least one resource are clickable.
        </p>
      </div>
    );
  }

  // DB is configured but truly empty (no resources at all).
  return (
    <div className="card p-8 text-sm text-ink-600">
      <h2 className="font-serif text-xl text-ink-900 mb-2">No published resources yet</h2>
      <p className="mb-3">
        The database is connected but no resources have been published. Run the seed
        scripts to populate the catalog:
      </p>
      <ol className="list-decimal pl-5 space-y-1.5">
        <li>
          <code>npm run db:seed-all</code> — sources, tags, board, clinicians, and 32
          curated resources.
        </li>
        <li>
          Approve resources via <Link className="underline" href="/admin">/admin</Link>{" "}
          (or run the local helper{" "}
          <code>npx tsx scripts/publish-all-resources.ts</code> for review-mode).
        </li>
      </ol>
    </div>
  );
}
