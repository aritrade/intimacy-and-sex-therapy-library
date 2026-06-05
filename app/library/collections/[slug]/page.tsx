import Link from "next/link";
import { notFound } from "next/navigation";
import { listLibraryItems } from "@/lib/db/queries";
import { COLLECTIONS, collectionBySlug, collectionItems } from "@/lib/library/collections";
import { toLibItem } from "@/lib/library/to-lib-item";
import { LibraryCard } from "@/components/library/LibraryCard";
import { CollectionProgress } from "@/components/library/CollectionProgress";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return COLLECTIONS.map((c) => ({ slug: c.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const c = collectionBySlug(params.slug);
  return { title: c ? `${c.title} · Library` : "Collection · Library" };
}

export default async function CollectionPage({ params }: { params: { slug: string } }) {
  const collection = collectionBySlug(params.slug);
  if (!collection) notFound();

  const all = await listLibraryItems();
  // Readable-inline items first, then by recency — a sensible reading order.
  const items = collectionItems(all, collection)
    .sort((a, b) => {
      if (a.readableInline !== b.readableInline) return a.readableInline ? -1 : 1;
      const at = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bt = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bt - at;
    })
    .map(toLibItem);

  return (
    <div className="container-page py-10">
      <header className="mb-8 max-w-3xl">
        <Link href="/library" className="text-sm text-ink-400 hover:text-ink-900">
          ← Library
        </Link>
        <p className="mt-2 pill-coral w-fit">Reading journey</p>
        <h1 className="mt-2 font-serif text-3xl text-ink-900 sm:text-4xl">{collection.title}</h1>
        <p className="mt-2 text-ink-600">{collection.blurb}</p>
        {items.length > 0 && <CollectionProgress ids={items.map((i) => i.id)} />}
      </header>

      {items.length === 0 ? (
        <div className="card p-8 text-sm text-ink-600">
          <p className="mb-3">
            No readings here yet — the library is still growing. Try{" "}
            <Link href={`/library/discover?q=${encodeURIComponent(collection.title)}`} className="underline">
              Discover
            </Link>{" "}
            to research this theme now.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <li key={it.id}>
              <LibraryCard item={it} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
