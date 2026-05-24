import Link from "next/link";
import { listLibraryItems } from "@/lib/db/queries";
import { buildLibraryDeepLinks } from "@/lib/library/deep-links";

export const metadata = { title: "Library · Intimacy & Sex Therapy Library" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  book: "Book",
  report: "Report",
  guideline: "Clinical guideline",
  worksheet: "Worksheet",
  article: "Open-access PDF",
};

const KIND_PILL: Record<string, string> = {
  book: "pill-coral",
  report: "pill-coral",
  guideline: "pill-accent",
  worksheet: "pill-accent",
  article: "pill-accent",
};

export default async function LibraryPage() {
  const items = await listLibraryItems();

  const openAccess = items.filter((it) => !!it.pdfBlobUrl);
  const metadataOnly = items.filter((it) => !it.pdfBlobUrl);

  return (
    <div className="container-page py-10">
      <header className="mb-8 max-w-3xl">
        <p className="pill-coral w-fit">Virtual Library</p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">
          Books and reports, read in your browser
        </h1>
        <p className="mt-2 text-ink-600">
          Open-access PDFs are read inline. For copyrighted books we surface metadata,
          curator notes, and authorized deep-links to the publisher, Google Books,
          Open Library, and WorldCat — never the full PDF.
        </p>
        <p className="mt-2 text-xs text-ink-400">
          {items.length === 0
            ? "Nothing ingested yet."
            : `${openAccess.length} open-access · ${metadataOnly.length} metadata-only`}
        </p>
      </header>

      {items.length === 0 ? (
        <div className="card p-8 text-sm text-ink-600">
          <h2 className="font-serif text-xl text-ink-900 mb-2">No library items yet</h2>
          <p className="mb-3">
            The library lists books, reports, clinical guidelines, worksheets, and any
            open-access PDFs. None have been seeded yet.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <code>npm run db:seed-resources</code> to add 3 books + 7 clinical
              guidelines + 1 worksheet from the curated set.
            </li>
            <li>
              <code>
                npm run ingest -- --source=wpath
              </code>{" "}
              to fetch the WPATH SOC8 (CC BY-NC-ND).
            </li>
            <li>
              <code>
                npm run ingest -- --source=pmc --query=&quot;sex therapy&quot;
              </code>{" "}
              for open-access journal PDFs.
            </li>
          </ul>
        </div>
      ) : (
        <div className="space-y-10">
          {openAccess.length > 0 && (
            <section aria-labelledby="lib-open">
              <h2 id="lib-open" className="font-serif text-2xl text-ink-900 mb-3">
                Read inline
              </h2>
              <p className="text-sm text-ink-600 mb-4 max-w-2xl">
                Open-access PDFs we host directly. Click any card to open the in-browser
                reader and ask the chatbot questions scoped to that document.
              </p>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {openAccess.map((it) => (
                  <li key={it.id}>
                    <Link
                      href={`/library/${it.id}`}
                      className="card card-hover p-5 h-full flex flex-col group"
                    >
                      <span className={`${KIND_PILL[it.kind] ?? "pill"} w-fit`}>
                        {KIND_LABEL[it.kind] ?? it.kind}
                      </span>
                      <h3 className="mt-3 font-serif text-base text-ink-900 group-hover:text-accent-ink">
                        {it.title}
                      </h3>
                      {it.authors.length > 0 && (
                        <p className="mt-1 text-sm text-ink-600 line-clamp-1">
                          {it.authors.slice(0, 3).join(", ")}
                        </p>
                      )}
                      {it.summary && (
                        <p className="mt-2 text-sm text-ink-600 line-clamp-3 flex-1">
                          {it.summary}
                        </p>
                      )}
                      <div className="mt-3 text-xs text-ink-400">{it.source.name}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {metadataOnly.length > 0 && (
            <section aria-labelledby="lib-meta">
              <h2 id="lib-meta" className="font-serif text-2xl text-ink-900 mb-3">
                Metadata &amp; authorized deep-links
              </h2>
              <p className="text-sm text-ink-600 mb-4 max-w-2xl">
                Copyrighted books and clinical guidelines we don&apos;t host. Each entry
                links out to the publisher and to library lending so you can read it
                legitimately.
              </p>
              <ul className="grid gap-4 sm:grid-cols-2">
                {metadataOnly.map((it) => {
                  const links = buildLibraryDeepLinks({
                    title: it.title,
                    authors: it.authors,
                    publisherUrl: it.externalUrl,
                    publisherName: it.source.name,
                  });
                  return (
                    <li key={it.id}>
                      <article className="card p-5 h-full flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className={`${KIND_PILL[it.kind] ?? "pill"} w-fit`}>
                            {KIND_LABEL[it.kind] ?? it.kind}
                          </span>
                          <span className="text-xs text-ink-400">{it.source.name}</span>
                        </div>
                        <h3 className="mt-3 font-serif text-base text-ink-900">
                          <Link
                            href={`/resource/${it.slug}`}
                            className="hover:text-accent-ink"
                          >
                            {it.title}
                          </Link>
                        </h3>
                        {it.authors.length > 0 && (
                          <p className="mt-1 text-sm text-ink-600">
                            {it.authors.slice(0, 4).join(", ")}
                          </p>
                        )}
                        {it.summary && (
                          <p className="mt-2 text-sm text-ink-600 line-clamp-3 flex-1">
                            {it.summary}
                          </p>
                        )}
                        <div className="mt-4 flex flex-wrap gap-2 text-xs">
                          {links.map((l) => (
                            <a
                              key={l.label}
                              href={l.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={l.hint}
                              className="pill hover:border-accent/30 hover:bg-elevated"
                            >
                              {l.label} ↗
                            </a>
                          ))}
                          <Link
                            href={`/resource/${it.slug}`}
                            className="pill hover:border-accent/30 hover:bg-elevated"
                          >
                            Curator notes
                          </Link>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
