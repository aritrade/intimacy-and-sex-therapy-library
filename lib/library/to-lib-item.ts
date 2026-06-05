import type { LibraryItem } from "@/lib/db/queries";
import type { LibItem } from "@/components/library/types";

/** Map the rich DB LibraryItem to the serializable, client-safe LibItem. */
export function toLibItem(it: LibraryItem): LibItem {
  return {
    id: it.id,
    slug: it.slug,
    title: it.title,
    kind: it.kind,
    authors: it.authors,
    summary: it.summary,
    tagNames: it.tagNames,
    sourceName: it.source.name,
    readTimeMin: it.readTimeMin,
    readableInline: it.readableInline,
    publishedAtMs: it.publishedAt ? new Date(it.publishedAt).getTime() : null,
    href: it.readableInline ? `/library/${it.id}` : `/resource/${it.slug}`,
  };
}
