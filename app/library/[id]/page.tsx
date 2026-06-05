import Link from "next/link";
import { notFound } from "next/navigation";
import { getLibraryReaderDoc, getRelatedResources } from "@/lib/db/queries";
import { keyTakeaways } from "@/lib/discover/takeaways";
import { toLibItem } from "@/lib/library/to-lib-item";
import { isTopicTag, topicLabel } from "@/lib/library/collections";
import { SaveButton } from "@/components/library/SaveButton";
import { ReadingTracker } from "@/components/library/ReadingTracker";
import { RelatedReading } from "@/components/library/RelatedReading";

export const dynamic = "force-dynamic";

export default async function LibraryReaderPage({
  params,
}: {
  params: { id: string };
}) {
  if (!process.env.DATABASE_URL) notFound();

  const doc = await getLibraryReaderDoc(params.id);
  if (!doc) notFound();

  const hasBody = doc.paragraphs.length > 0;
  // Nothing to read inline (no PDF, no OA full text) — send to detail page.
  if (!doc.pdfBlobUrl && !hasBody) notFound();

  const topics = doc.tagNames.filter(isTopicTag);

  const [takeaways, related] = await Promise.all([
    hasBody
      ? keyTakeaways({ id: doc.id, title: doc.title, body: doc.paragraphs.join("\n\n") })
      : Promise.resolve(null),
    getRelatedResources(doc.id, 6),
  ]);
  const relatedItems = related.map(toLibItem);

  return (
    <div className="container-page py-6">
      <ReadingTracker
        id={doc.id}
        title={doc.title}
        href={`/library/${doc.id}`}
        topics={topics}
      />

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill-accent w-fit">{doc.sourceName}</span>
            {doc.readTimeMin != null && (
              <span className="text-xs text-ink-400">{doc.readTimeMin} min read</span>
            )}
            <span className="text-xs text-ink-400">
              License: <code>{doc.license}</code>
            </span>
          </div>
          <h1 className="mt-3 font-serif text-2xl text-ink-900 sm:text-3xl">{doc.title}</h1>
          {doc.authors.length > 0 && (
            <p className="mt-1 text-sm text-ink-600">{doc.authors.slice(0, 6).join(", ")}</p>
          )}
          {topics.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {topics.slice(0, 5).map((t) => (
                <Link key={t} href={`/library/discover?q=${encodeURIComponent(topicLabel(t))}`} className="pill text-[11px]">
                  {topicLabel(t)}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <SaveButton id={doc.id} />
          <Link href={`/resource/${doc.slug}`} className="btn-secondary">
            Details
          </Link>
          <Link href={`/chat?scope=${doc.id}`} className="btn-primary">
            Ask the library
          </Link>
          <a href={doc.externalUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
            Source ↗
          </a>
        </div>
      </header>

      {takeaways && takeaways.points.length > 0 && (
        <aside className="card mb-6 border-accent/20 bg-accent/5 p-5">
          <h2 className="mb-2 font-serif text-lg text-ink-900">Key takeaways</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-700">
            {takeaways.points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-400">
            AI-generated summary of this open-access article. Always verify against the full text.
          </p>
        </aside>
      )}

      {doc.pdfBlobUrl ? (
        <div className="card overflow-hidden">
          <object
            data={doc.pdfBlobUrl}
            type="application/pdf"
            aria-label={`PDF reader: ${doc.title}`}
            className="h-[80vh] w-full"
          >
            <p className="p-4 text-sm text-ink-600">
              Your browser can&apos;t display this PDF inline.{" "}
              <a href={doc.pdfBlobUrl} target="_blank" rel="noopener noreferrer" className="underline">
                Download the PDF
              </a>{" "}
              or{" "}
              <a href={doc.externalUrl} target="_blank" rel="noopener noreferrer" className="underline">
                open at source
              </a>
              .
            </p>
          </object>
        </div>
      ) : (
        <article className="max-w-3xl">
          {doc.summary && (
            <p className="mb-6 border-l-2 border-accent/40 pl-4 text-base italic text-ink-600">
              {doc.summary}
            </p>
          )}
          {doc.paragraphs.map((p, i) => (
            <p key={i} className="mb-4 leading-relaxed text-ink-800">
              {p}
            </p>
          ))}
          <p className="mt-8 rounded-lg bg-elevated p-4 text-xs text-ink-500">
            Reconstructed from the open-access full text ({doc.license}).{" "}
            <a href={doc.externalUrl} target="_blank" rel="noopener noreferrer" className="underline">
              View the original
            </a>{" "}
            for figures, tables, and references.
          </p>
        </article>
      )}

      <RelatedReading items={relatedItems} />
    </div>
  );
}
