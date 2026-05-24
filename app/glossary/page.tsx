import glossary from "@/content/glossary.json";

type GlossaryEntry = {
  term: string;
  aka?: string[];
  category: string;
  plain: string;
  clinical?: string;
  see_also?: string[];
};

export const metadata = {
  title: "Glossary · Intimacy & Sex Therapy Library",
  description:
    "Plain-language definitions of clinical terms used across the catalog. Curator-authored; no AI-generated definitions.",
};

export default function GlossaryPage() {
  const entries = (glossary.entries as GlossaryEntry[]).slice().sort((a, b) =>
    a.term.localeCompare(b.term),
  );

  return (
    <div className="container-page py-10 max-w-3xl">
      <header className="mb-8">
        <p className="pill-teal w-fit">Glossary</p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">
          Plain-language definitions
        </h1>
        <p className="mt-2 text-ink-600">
          Each entry is curator-authored and reviewed — we never auto-generate definitions
          for clinical content.
        </p>
      </header>

      <dl className="space-y-4">
        {entries.map((e) => (
          <section
            key={e.term}
            id={e.term.toLowerCase().replace(/\s+/g, "-")}
            className="card p-5"
          >
            <dt className="font-serif text-xl text-ink-900">
              {e.term}
              {e.aka && e.aka.length > 0 && (
                <span className="ml-2 text-sm text-ink-400 font-sans">
                  · also called: {e.aka.join(", ")}
                </span>
              )}
            </dt>
            <dd className="mt-2 text-ink-600 leading-relaxed">{e.plain}</dd>
            {e.clinical && (
              <dd className="mt-2 text-sm text-ink-400 italic">{e.clinical}</dd>
            )}
            {e.see_also && e.see_also.length > 0 && (
              <dd className="mt-3 text-xs text-ink-400">
                see also:{" "}
                {e.see_also.map((s, i) => (
                  <a
                    key={s}
                    href={`#${s.toLowerCase().replace(/\s+/g, "-")}`}
                    className="text-accent-ink hover:underline"
                  >
                    {s}
                    {i < (e.see_also?.length ?? 0) - 1 ? ", " : ""}
                  </a>
                ))}
              </dd>
            )}
          </section>
        ))}
      </dl>
    </div>
  );
}
