import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { resources, sources } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function LibraryReaderPage({
  params,
}: {
  params: { id: string };
}) {
  if (!process.env.DATABASE_URL) notFound();

  const row = await db
    .select({
      title: resources.title,
      authors: resources.authors,
      pdfBlobUrl: resources.pdfBlobUrl,
      externalUrl: resources.externalUrl,
      license: resources.license,
      fullTextAvailable: resources.fullTextAvailable,
      sourceName: sources.name,
      slug: resources.slug,
    })
    .from(resources)
    .innerJoin(sources, eq(resources.sourceId, sources.id))
    .where(eq(resources.id, params.id))
    .limit(1);

  if (row.length === 0 || !row[0].pdfBlobUrl) notFound();
  const r = row[0];

  return (
    <div className="container-page py-6">
      <header className="mb-4 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="pill-coral w-fit">PDF · {r.sourceName}</p>
          <h1 className="mt-2 font-serif text-2xl text-ink-900">{r.title}</h1>
          {(r.authors as string[]).length > 0 && (
            <p className="text-sm text-ink-600">
              {(r.authors as string[]).slice(0, 4).join(", ")}
            </p>
          )}
          <p className="mt-1 text-xs text-ink-400">
            License: <code>{r.license}</code>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={`/resource/${r.slug}`} className="btn-secondary">
            Resource details
          </Link>
          <Link href={`/chat?scope=${params.id}`} className="btn-primary">
            Ask the library
          </Link>
          <a href={r.externalUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
            Open at source ↗
          </a>
        </div>
      </header>

      <div className="card overflow-hidden">
        <object
          data={r.pdfBlobUrl ?? undefined}
          type="application/pdf"
          aria-label={`PDF reader: ${r.title}`}
          className="w-full h-[80vh]"
        >
          <p className="p-4 text-sm text-ink-600">
            Your browser can&apos;t display this PDF inline.{" "}
            <a
              href={r.pdfBlobUrl ?? r.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Download the PDF
            </a>{" "}
            or{" "}
            <a
              href={r.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              open at source
            </a>
            .
          </p>
        </object>
      </div>
    </div>
  );
}
