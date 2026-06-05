import Link from "next/link";
import { listLibraryItems } from "@/lib/db/queries";
import { COLLECTIONS, collectionItems, isTopicTag, topicLabel } from "@/lib/library/collections";
import { toLibItem } from "@/lib/library/to-lib-item";
import { LibraryCard } from "@/components/library/LibraryCard";
import { LibraryBrowser } from "@/components/library/LibraryBrowser";
import { MyLibrary } from "@/components/library/MyLibrary";
import type { LibItem } from "@/components/library/types";

export const metadata = {
  title: "Library & Discover · Intimacy & Sex Therapy Library",
  description:
    "Read evidence-based articles, books, and guidelines on intimacy, sex therapy, the asexual spectrum, LGBTQ+ affirming care, and more — plus an AI Discover that researches any topic for you.",
};
export const dynamic = "force-dynamic";

/** Horizontal scrolling shelf of cards. */
function Shelf({ items }: { items: LibItem[] }) {
  return (
    <ul className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
      {items.map((it) => (
        <li key={it.id} className="w-72 shrink-0">
          <LibraryCard item={it} />
        </li>
      ))}
    </ul>
  );
}

export default async function LibraryPage() {
  const raw = await listLibraryItems();
  const items = raw.map(toLibItem);

  // Top topics by item count (first-class taxonomy topics only).
  const topicCounts = new Map<string, number>();
  for (const it of items) {
    for (const t of it.tagNames) {
      if (isTopicTag(t)) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
    }
  }
  const topTopics = [...topicCounts.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([slug]) => slug);

  // Most-recently-ingested items for the "Recently added" shelf.
  const byCreated = [...raw]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8)
    .map(toLibItem);

  // Deterministic daily featured pick among readable items.
  const readable = items.filter((it) => it.readableInline);
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const daily = readable.length > 0 ? readable[dayIndex % readable.length] : null;

  const collectionsWithItems = COLLECTIONS.map((c) => ({
    collection: c,
    items: collectionItems(items, c),
  })).filter((c) => c.items.length > 0);

  return (
    <div className="container-page py-10">
      <header className="mb-10 max-w-3xl">
        <p className="pill-coral w-fit">Library &amp; Discover</p>
        <h1 className="mt-3 font-serif text-3xl text-ink-900 sm:text-4xl">
          A growing library of intimacy &amp; sex-therapy knowledge
        </h1>
        <p className="mt-2 text-ink-600">
          Read evidence-based articles, books, and clinical guidelines on desire, the asexual
          spectrum, LGBTQ+ affirming care, trauma, relationships, and more — right here in your
          browser. Can&apos;t find it? Let <span className="text-accent-ink">Discover</span>{" "}
          research any topic across the open research web.
        </p>

        <form action="/library/discover" method="get" className="mt-5 flex gap-2">
          <input
            type="search"
            name="q"
            required
            placeholder="Ask anything — e.g. “responsive desire”, “asexuality and relationships”…"
            className="w-full rounded-full border border-ink-200 bg-surface px-5 py-3 text-sm shadow-sm focus:border-accent/50 focus:outline-none"
          />
          <button type="submit" className="btn-primary shrink-0">
            Discover
          </button>
        </form>
        <p className="mt-2 text-xs text-ink-400">
          {items.length} item{items.length === 1 ? "" : "s"} in the library ·{" "}
          {readable.length} readable inline
        </p>
      </header>

      {items.length === 0 ? (
        <div className="card p-8 text-sm text-ink-600">
          <h2 className="mb-2 font-serif text-xl text-ink-900">The library is still filling up</h2>
          <p className="mb-3">
            Run <code>npm run seed:corpus</code> then <code>npm run backfill:embeddings</code> to
            ingest open-access articles, or try{" "}
            <Link href="/library/discover" className="underline">
              Discover
            </Link>{" "}
            to pull research on a topic right now.
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          <MyLibrary items={items} />

          {daily && (
            <section aria-labelledby="daily-pick">
              <h2 id="daily-pick" className="mb-3 font-serif text-2xl text-ink-900">
                Today&apos;s pick
              </h2>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-1">
                  <LibraryCard item={daily} />
                </div>
                <p className="hidden text-sm text-ink-500 lg:col-span-2 lg:block">
                  A fresh, evidence-based read each day. Save it for later with the ♡, or open it to
                  read inline and ask the library questions about it.
                </p>
              </div>
            </section>
          )}

          {collectionsWithItems.length > 0 && (
            <section aria-labelledby="collections">
              <h2 id="collections" className="mb-1 font-serif text-2xl text-ink-900">
                Reading journeys
              </h2>
              <p className="mb-4 text-sm text-ink-600">
                Curated paths through the library. Follow one at your own pace.
              </p>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {collectionsWithItems.map(({ collection, items: ci }) => (
                  <li key={collection.slug}>
                    <Link
                      href={`/library/collections/${collection.slug}`}
                      className={`card card-hover flex h-full flex-col p-5 ${
                        collection.accent === "coral"
                          ? "border-coral/20 bg-coral/5"
                          : "border-accent/20 bg-accent/5"
                      }`}
                    >
                      <h3 className="font-serif text-lg text-ink-900">{collection.title}</h3>
                      <p className="mt-2 flex-1 text-sm text-ink-600">{collection.blurb}</p>
                      <span className="mt-3 text-xs text-ink-400">{ci.length} reads →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {byCreated.length > 0 && (
            <section aria-labelledby="recent">
              <h2 id="recent" className="mb-3 font-serif text-2xl text-ink-900">
                Recently added
              </h2>
              <Shelf items={byCreated} />
            </section>
          )}

          {topTopics.map((slug) => {
            const shelf = items.filter((it) => it.tagNames.includes(slug)).slice(0, 10);
            if (shelf.length === 0) return null;
            return (
              <section key={slug} aria-label={`Topic: ${topicLabel(slug)}`}>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="font-serif text-2xl text-ink-900">{topicLabel(slug)}</h2>
                  <Link
                    href={`/library/discover?q=${encodeURIComponent(topicLabel(slug))}`}
                    className="text-sm text-accent-ink hover:underline"
                  >
                    Explore more →
                  </Link>
                </div>
                <Shelf items={shelf} />
              </section>
            );
          })}

          <LibraryBrowser items={items} />
        </div>
      )}
    </div>
  );
}
