import Link from "next/link";
import { getDiscover } from "@/lib/discover/service";
import type { Candidate } from "@/lib/discover/sources";
import { DISCLAIMERS } from "@/lib/safety/disclaimers";
import { COLLECTIONS } from "@/lib/library/collections";
import { DiscoverRefresh } from "@/components/library/DiscoverRefresh";
import { ReportLink } from "@/components/library/ReportLink";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function generateMetadata({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.trim();
  return {
    title: q
      ? `Discover: ${q} · Library`
      : "Discover · Intimacy & Sex Therapy Library",
  };
}

const KIND_BADGE: Record<Candidate["kind"], string> = {
  corpus: "In our library",
  article: "Research article",
  book: "Book",
  web: "Explainer",
};

const SUGGESTIONS = [
  "Responsive desire",
  "Asexuality and relationships",
  "Rebuilding intimacy after trauma",
  "LGBTQ+ affirming therapy",
  "Desire discrepancy in couples",
  "Perimenopause and libido",
  "Polyamory and jealousy",
  "Vaginismus treatment",
];

function EmptyState() {
  return (
    <div className="container-page py-10">
      <header className="mb-8 max-w-3xl">
        <p className="pill-coral w-fit">Discover</p>
        <h1 className="mt-3 font-serif text-3xl text-ink-900 sm:text-4xl">
          Research any topic, instantly
        </h1>
        <p className="mt-2 text-ink-600">
          Type a question or topic and the library researches it across our own collection plus the
          open research web — returning a plain-language, cited brief and a ranked reading list.
        </p>
        <form action="/library/discover" method="get" className="mt-5 flex gap-2">
          <input
            type="search"
            name="q"
            required
            autoFocus
            placeholder="e.g. “Why has my desire changed?”"
            className="w-full rounded-full border border-ink-200 bg-surface px-5 py-3 text-sm shadow-sm focus:border-accent/50 focus:outline-none"
          />
          <button type="submit" className="btn-primary shrink-0">
            Discover
          </button>
        </form>
      </header>
      <section aria-labelledby="suggestions">
        <h2 id="suggestions" className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-400">
          Try a topic
        </h2>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <Link
              key={s}
              href={`/library/discover?q=${encodeURIComponent(s)}`}
              className="pill hover:border-accent/30 hover:bg-elevated"
            >
              {s}
            </Link>
          ))}
          {COLLECTIONS.slice(0, 4).map((c) => (
            <Link
              key={c.slug}
              href={`/library/collections/${c.slug}`}
              className="pill-accent hover:opacity-90"
            >
              {c.title}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function sourceHref(s: Candidate): string {
  return s.inLibrary && s.resourceId ? `/library/${s.resourceId}` : s.url;
}

export default async function DiscoverPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.trim();
  if (!q) return <EmptyState />;

  const { result, fetchedAt, stale } = await getDiscover(q);
  const { brief, sources, llm } = result;

  // Number sources for [n] citations (stable: by sources array order).
  const refToNum = new Map<string, number>();
  sources.forEach((s, i) => refToNum.set(s.ref, i + 1));
  const byRef = new Map(sources.map((s) => [s.ref, s]));

  const readingList = brief.readingList
    .map((r) => byRef.get(r.ref))
    .filter((s): s is Candidate => !!s);

  return (
    <div className="container-page py-10">
      <header className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/library" className="text-sm text-ink-400 hover:text-ink-900">
              ← Library
            </Link>
            <h1 className="mt-1 font-serif text-3xl text-ink-900">{q}</h1>
          </div>
          <DiscoverRefresh
            q={q}
            fetchedAtMs={fetchedAt ? fetchedAt.getTime() : null}
            stale={stale}
          />
        </div>
        <form action="/library/discover" method="get" className="mt-4 flex max-w-2xl gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            className="w-full rounded-full border border-ink-200 bg-surface px-5 py-2.5 text-sm focus:border-accent/50 focus:outline-none"
          />
          <button type="submit" className="btn-secondary shrink-0">
            Search
          </button>
        </form>
      </header>

      {sources.length === 0 ? (
        <div className="card p-8 text-sm text-ink-600">
          <p>
            We couldn&apos;t find solid sources for “{q}” right now. Try rephrasing, or browse the{" "}
            <Link href="/library" className="underline">
              library
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          {/* Topic Brief */}
          <article className="space-y-6">
            <section className="card p-6">
              <h2 className="mb-2 font-serif text-2xl text-ink-900">In short</h2>
              <p className="leading-relaxed text-ink-700">{brief.summary}</p>
            </section>

            {brief.whatResearchSays.length > 0 && (
              <section>
                <h2 className="mb-3 font-serif text-xl text-ink-900">What the research says</h2>
                <ul className="space-y-3">
                  {brief.whatResearchSays.map((p, i) => (
                    <li key={i} className="card p-4 text-sm leading-relaxed text-ink-700">
                      {p.point}{" "}
                      {p.refs.map((r) => {
                        const n = refToNum.get(r);
                        const s = byRef.get(r);
                        if (!n || !s) return null;
                        return (
                          <a
                            key={r}
                            href={sourceHref(s)}
                            target={s.inLibrary ? undefined : "_blank"}
                            rel="noopener noreferrer"
                            className="align-super text-[11px] text-accent-ink hover:underline"
                          >
                            [{n}]
                          </a>
                        );
                      })}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {brief.mythsVsFacts.length > 0 && (
              <section>
                <h2 className="mb-3 font-serif text-xl text-ink-900">Myths vs. facts</h2>
                <ul className="space-y-3">
                  {brief.mythsVsFacts.map((m, i) => (
                    <li key={i} className="card p-4 text-sm">
                      <p className="text-ink-500 line-through decoration-coral/50">{m.myth}</p>
                      <p className="mt-1 text-ink-800">{m.fact}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {brief.whatYouCanTry.length > 0 && (
              <section className="card border-accent/20 bg-accent/5 p-5">
                <h2 className="mb-2 font-serif text-xl text-ink-900">Gentle things you can try</h2>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-700">
                  {brief.whatYouCanTry.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="card p-5">
                <h2 className="mb-2 font-serif text-lg text-ink-900">When to seek help</h2>
                <p className="text-sm text-ink-700">{brief.whenToSeekHelp}</p>
              </div>
              <div className="card p-5">
                <h2 className="mb-2 font-serif text-lg text-ink-900">For everyone</h2>
                <p className="text-sm text-ink-700">{brief.inclusivityNote}</p>
              </div>
            </section>

            <div className="flex flex-wrap gap-2">
              <Link href={`/chat?q=${encodeURIComponent(q)}`} className="btn-primary">
                Ask the companion about this
              </Link>
            </div>

            <p className="text-xs text-ink-400">
              {llm
                ? "This brief is AI-synthesized from the cited sources only — always verify against the originals."
                : "Showing curated real sources (AI summary unavailable right now)."}{" "}
              {DISCLAIMERS.educational}
            </p>
          </article>

          {/* Reading list */}
          <aside>
            <h2 className="mb-3 font-serif text-xl text-ink-900">Reading list</h2>
            <ol className="space-y-3">
              {readingList.map((s) => (
                <li key={s.ref} className="card p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-medium text-ink-400">#{refToNum.get(s.ref)}</span>
                    <span className="pill text-[11px]">{KIND_BADGE[s.kind]}</span>
                    {s.openAccess && s.kind !== "corpus" && (
                      <span className="pill-accent text-[11px]">Open access</span>
                    )}
                  </div>
                  <h3 className="font-serif text-sm leading-snug text-ink-900">
                    <a
                      href={sourceHref(s)}
                      target={s.inLibrary ? undefined : "_blank"}
                      rel="noopener noreferrer"
                      className="hover:text-accent-ink"
                    >
                      {s.title}
                    </a>
                  </h3>
                  <p className="mt-1 text-xs text-ink-500">
                    {[s.authors.slice(0, 2).join(", "), s.year, s.source]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    {s.inLibrary ? (
                      <span className="text-xs text-accent-ink">Read inline →</span>
                    ) : (
                      <span className="text-xs text-ink-400">Opens at source ↗</span>
                    )}
                    <ReportLink refId={s.ref} />
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      )}
    </div>
  );
}
