import myths from "@/content/myths.json";

type MythEntry = {
  id: string;
  myth: string;
  context_in?: string;
  fact: string;
  what_helps?: string;
  sources?: string[];
};

export const metadata = {
  title: "Myths vs. Facts · Intimacy & Sex Therapy Library",
  description:
    "Common misconceptions about sex and intimacy — including India-specific myths — addressed with evidence-backed corrections.",
};

export default function MythsPage() {
  const entries = myths.entries as MythEntry[];

  return (
    <div className="container-page py-10 max-w-3xl">
      <header className="mb-8">
        <p className="pill-coral w-fit">Myths vs. Facts</p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">
          What people get told vs. what the evidence says
        </h1>
        <p className="mt-2 text-ink-600">
          Common misconceptions, including ones particularly familiar in Indian contexts,
          paired with what the research actually shows. Every entry is reviewed by a
          credentialed clinician.
        </p>
      </header>

      <ol className="space-y-4">
        {entries.map((m) => (
          <li key={m.id} id={m.id} className="card p-5">
            <p className="text-[11px] uppercase tracking-wider text-warn font-semibold">Myth</p>
            <h2 className="mt-1 font-serif text-lg text-ink-900 leading-snug">
              &ldquo;{m.myth}&rdquo;
            </h2>
            {m.context_in && (
              <p className="mt-2 text-sm text-ink-400">Where it shows up: {m.context_in}</p>
            )}

            <div className="mt-4 rounded-xl border border-ok/30 bg-ok/5 p-3">
              <p className="text-[11px] uppercase tracking-wider text-ok font-semibold">Fact</p>
              <p className="mt-1 text-ink-800">{m.fact}</p>
            </div>

            {m.what_helps && (
              <div className="mt-3 rounded-xl border border-accent/30 bg-accent-soft p-3">
                <p className="text-[11px] uppercase tracking-wider text-accent-ink font-semibold">
                  What helps
                </p>
                <p className="mt-1 text-accent-ink">{m.what_helps}</p>
              </div>
            )}

            {m.sources && m.sources.length > 0 && (
              <details className="mt-4 text-sm text-ink-600">
                <summary className="cursor-pointer text-ink-400 hover:text-ink-900">
                  Sources
                </summary>
                <ul className="mt-2 space-y-1 list-disc pl-5">
                  {m.sources.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
