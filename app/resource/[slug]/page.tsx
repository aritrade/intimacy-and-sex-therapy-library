import Link from "next/link";
import { notFound } from "next/navigation";
import { getResourceBySlug, listCatalog } from "@/lib/db/queries";
import { MediaPlayer } from "@/components/MediaPlayer";
import { ResourceCard } from "@/components/ResourceCard";
import { TrackResourceView } from "@/components/TrackResourceView";
import { buildLibraryDeepLinks } from "@/lib/library/deep-links";
import { readingMinutes, resolveEmbed } from "@/lib/media/embed";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  article: "Article",
  book: "Book",
  report: "Report",
  guideline: "Clinical guideline",
  worksheet: "Worksheet",
  video: "Video",
};

const TIER_LABEL: Record<string, string> = {
  tier_1: "Tier 1 source — clinical body / peer-reviewed / accredited",
  tier_2: "Tier 2 source — vetted publisher / NGO",
  tier_3: "Tier 3 source — popular but reviewed",
};

export default async function ResourcePage({
  params,
}: {
  params: { slug: string };
}) {
  const r = await getResourceBySlug(params.slug);
  if (!r) notFound();

  const embed = resolveEmbed(r.externalUrl);
  const isVideo = r.kind === "video" && !!embed;
  const hasPdf = !!r.pdfBlobUrl;
  const isBookOrGuideline = ["book", "report", "guideline", "worksheet"].includes(r.kind);
  const minutes = isVideo ? null : readingMinutes(`${r.summary ?? ""} ${r.curatorNotes ?? ""}`);

  const deepLinks = isBookOrGuideline && !hasPdf
    ? buildLibraryDeepLinks({
        title: r.title,
        authors: r.authors,
        publisherUrl: r.externalUrl,
        publisherName: r.source.name,
      })
    : [];

  // Related shelf: 4 other published resources sharing at least one topic tag.
  const topicTag = r.tagNames.find((t) =>
    !["beginner", "intermediate", "advanced", "psychoeducation", "general"].includes(t)
  );
  const related = topicTag
    ? (await listCatalog({ topic: topicTag, limit: 5 })).filter((x) => x.id !== r.id).slice(0, 4)
    : [];

  // Synthesise structured panels from data we have. Honest about what these are.
  const whoFor: string[] = [];
  if (r.tagNames.includes("beginner")) whoFor.push("New to the topic");
  if (r.tagNames.includes("intermediate")) whoFor.push("Some prior reading or therapy experience");
  if (r.tagNames.includes("advanced")) whoFor.push("Clinicians, students, or readers wanting depth");
  if (r.tagNames.includes("couples")) whoFor.push("Partners reading together");
  if (r.tagNames.includes("lgbtq")) whoFor.push("LGBTQ+ readers and affirming clinicians");

  return (
    <article className="container-page py-10 max-w-5xl">
      <TrackResourceView id={r.id} slug={r.slug} title={r.title} kind={r.kind} />

      <nav aria-label="Breadcrumb" className="text-xs text-ink-400 mb-3">
        <Link href="/catalog" className="hover:text-ink-900">Catalog</Link>
        <span aria-hidden> / </span>
        <span>{KIND_LABEL[r.kind] ?? r.kind}</span>
      </nav>

      <header className="grid gap-6 lg:grid-cols-[1fr_18rem] items-start mb-10">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
            <span className="pill-accent">{KIND_LABEL[r.kind] ?? r.kind}</span>
            <span title={TIER_LABEL[r.source.tier] ?? ""} className="pill">
              {r.source.name}
            </span>
            {r.publishedAt && <span>· {r.publishedAt.getFullYear()}</span>}
            {minutes && <span>· {minutes} min read</span>}
            {isVideo && <span>· video</span>}
          </div>
          <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900 leading-tight">
            {r.title}
          </h1>
          {r.authors.length > 0 && (
            <p className="mt-3 text-ink-600">
              {r.authors.join(", ")}
              {r.authorCredentials.length > 0 && (
                <span className="text-ink-400"> · {r.authorCredentials.join(" / ")}</span>
              )}
            </p>
          )}
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {r.tagNames.map((t) => (
              <li key={t}>
                <Link
                  href={`/catalog?topic=${t}`}
                  className="pill text-xs hover:border-accent/30 hover:bg-elevated"
                >
                  {t.replace(/_/g, " ")}
                </Link>
              </li>
            ))}
          </ul>

          {r.latestReview && (
            <div
              role="status"
              className="mt-5 rounded-md border border-ok/30 bg-ok/5 p-3 text-sm text-ink-800"
            >
              Reviewed by <strong>{r.latestReview.reviewerName}</strong>{" "}
              ({r.latestReview.reviewerCredentials.join(", ")}) ·{" "}
              {r.latestReview.reviewedAt.toISOString().slice(0, 10)} · next review due{" "}
              {r.latestReview.nextReviewDue.toISOString().slice(0, 10)}
            </div>
          )}
        </div>

        <aside className="card p-4 text-sm space-y-3 lg:sticky lg:top-4">
          {hasPdf && (
            <Link href={`/library/${r.id}`} className="btn-primary w-full justify-center">
              Read PDF in browser
            </Link>
          )}
          <Link href={`/chat?scope=${r.id}`} className="btn-secondary w-full justify-center">
            Ask the library about this
          </Link>
          <a
            href={r.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost w-full justify-center"
          >
            Open at source ↗
          </a>
          <p className="text-xs text-ink-400 pt-2 border-t border-border">
            License: <code>{r.license}</code>.
            {r.fullTextAvailable
              ? " Full text indexed for the chatbot."
              : " Metadata + curator notes only — full text is read at the publisher."}
          </p>
        </aside>
      </header>

      {/* Hero media: video player, PDF "open in reader" prompt, or quote-card */}
      <section className="mb-10" aria-label="Media">
        {isVideo && <MediaPlayer externalUrl={r.externalUrl} title={r.title} />}
        {!isVideo && hasPdf && (
          <Link
            href={`/library/${r.id}`}
            className="card card-hover p-6 flex items-center justify-between gap-4"
          >
            <div>
              <p className="text-xs text-ink-400">Open-access PDF</p>
              <h2 className="mt-1 font-serif text-xl text-ink-900">
                Read this in our in-browser PDF reader
              </h2>
              <p className="mt-1 text-sm text-ink-600">
                Stays inside the app. Pinch-to-zoom on tablets. The chatbot can answer
                questions scoped to this document.
              </p>
            </div>
            <span className="btn-primary">Open reader →</span>
          </Link>
        )}
        {!isVideo && !hasPdf && r.summary && (
          <blockquote className="card p-6 border-l-4 border-l-accent">
            <p className="font-serif text-xl text-ink-900 leading-relaxed">
              &ldquo;{r.summary}&rdquo;
            </p>
            <footer className="mt-3 text-sm text-ink-400">
              — Curator&apos;s framing of {r.title}
            </footer>
          </blockquote>
        )}
      </section>

      <div className="grid gap-10 lg:grid-cols-[1fr_18rem]">
        <div>
          {r.summary && (
            <section className="mb-8">
              <h2 className="font-serif text-2xl text-ink-900 mb-3">What this is about</h2>
              <p className="text-ink-700 leading-relaxed text-base sm:text-lg">{r.summary}</p>
            </section>
          )}

          {r.curatorNotes && (
            <section className="mb-8">
              <h2 className="font-serif text-2xl text-ink-900 mb-3">
                Curator&apos;s read
              </h2>
              <div className="text-ink-700 leading-relaxed text-base sm:text-lg whitespace-pre-line">
                {r.curatorNotes}
              </div>
            </section>
          )}

          {!r.curatorNotes && !hasPdf && !isVideo && (
            <section className="mb-8">
              <div className="card p-5 text-sm text-ink-600">
                <p>
                  We summarise this resource here so you can decide whether the original
                  is worth your time. The full text lives at <code>{r.source.name}</code>{" "}
                  — we link out rather than mirror it, to respect the publisher&apos;s
                  rights and to keep their reading experience canonical.
                </p>
                <a
                  href={r.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-accent-ink hover:underline"
                >
                  Read the original at {r.source.name} ↗
                </a>
              </div>
            </section>
          )}

          {deepLinks.length > 0 && (
            <section className="mb-8">
              <h2 className="font-serif text-2xl text-ink-900 mb-3">
                How to read the full {r.kind === "guideline" ? "guideline" : "book"}
              </h2>
              <p className="text-sm text-ink-600 mb-4">
                We don&apos;t host copyrighted text. These are the official ways to read it
                — buy from the publisher, preview on Google Books, borrow free from
                Open Library if a scan exists, or find a copy at a library near you.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {deepLinks.map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="card card-hover p-3 text-sm flex items-start gap-3"
                  >
                    <span className="font-medium text-ink-900">{l.label} ↗</span>
                    <span className="text-xs text-ink-400 flex-1">{l.hint}</span>
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-4 self-start">
          {whoFor.length > 0 && (
            <div className="card p-4">
              <h3 className="font-medium text-ink-900 mb-2">Who this is for</h3>
              <ul className="text-sm text-ink-600 space-y-1.5">
                {whoFor.map((w) => (
                  <li key={w} className="flex items-start gap-2">
                    <span aria-hidden className="text-accent mt-0.5">·</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card p-4 text-sm">
            <h3 className="font-medium text-ink-900 mb-2">Trust layer</h3>
            <ul className="text-ink-600 space-y-2">
              <li>
                <span className="text-ink-400">Source:</span> {r.source.name}
              </li>
              <li>
                <span className="text-ink-400">Authors:</span>{" "}
                {r.authors.length > 0 ? r.authors[0] : "Institutional"}
              </li>
              <li>
                <span className="text-ink-400">License:</span> <code>{r.license}</code>
              </li>
              {r.publishedAt && (
                <li>
                  <span className="text-ink-400">Published:</span>{" "}
                  {r.publishedAt.toISOString().slice(0, 10)}
                </li>
              )}
            </ul>
          </div>

          <div className="card p-4 text-sm">
            <h3 className="font-medium text-ink-900 mb-2">Stuck?</h3>
            <p className="text-ink-600 mb-3">
              Talk it through — Sahay can help you make sense of what you&apos;re reading.
            </p>
            <Link href="/companion" className="btn-secondary w-full justify-center">
              Open Sahay
            </Link>
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-12 pt-8 border-t border-border">
          <h2 className="font-serif text-2xl text-ink-900 mb-4">
            Continue with related resources
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((it) => (
              <li key={it.id}>
                <ResourceCard item={it} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
