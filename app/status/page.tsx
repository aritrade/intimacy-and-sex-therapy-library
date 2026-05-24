import Link from "next/link";
import { getHealthReport, type Subsystem } from "@/lib/health";

export const metadata = {
  title: "Operations status · Intimacy & Sex Therapy Library",
  description: "Real-time status of database, KMS, and AI provider readiness.",
};
export const dynamic = "force-dynamic";

const SUBSYSTEM_DESCRIPTIONS: Record<string, { label: string; what: string }> = {
  db: {
    label: "Database",
    what:
      "Postgres connectivity and pgvector extension. Affects catalog, library, search, account features, and admin.",
  },
  kms: {
    label: "Key management",
    what:
      "Envelope encryption for Sahay's encrypted-mode sessions. Affects companion sessions that opt out of zero-knowledge vault.",
  },
  llm: {
    label: "LLM provider",
    what:
      "Anthropic key for the citation chatbot and Sahay companion. If down, chat surfaces refuse with 501 instead of crashing.",
  },
  embed: {
    label: "Embeddings provider",
    what:
      "OpenAI key for text-embedding-3-small. If down, hybrid search degrades to BM25 only — still functional, just less fuzzy.",
  },
};

export default async function StatusPage() {
  const report = await getHealthReport();
  const overall = report.ok ? "OK" : "Degraded";

  const items = (Object.keys(report.subsystems) as Array<keyof typeof report.subsystems>).map(
    (key) => ({
      key,
      sub: report.subsystems[key] as Subsystem,
      meta: SUBSYSTEM_DESCRIPTIONS[key as string] ?? { label: String(key), what: "" },
    }),
  );

  return (
    <div className="container-page py-10 max-w-3xl">
      <header className="mb-8">
        <p className={report.ok ? "pill-teal w-fit" : "pill-coral w-fit"}>System status</p>
        <h1 className="mt-3 font-serif text-3xl text-ink-900">{overall}</h1>
        <p className="mt-2 text-ink-600">
          A live readout of the platform's required and optional subsystems. The
          entire site stays usable as a library even when LLM providers are down —
          chat and Sahay refuse cleanly with a 501 rather than serving partial
          answers.
        </p>
        <p className="mt-2 text-xs text-ink-400">
          Last checked: <time dateTime={report.ts}>{new Date(report.ts).toUTCString()}</time>
        </p>
      </header>

      <ul className="space-y-3" aria-label="Subsystems">
        {items.map(({ key, sub, meta }) => (
          <li key={key} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-serif text-lg text-ink-900">{meta.label}</h2>
                <p className="mt-1 text-sm text-ink-600">{meta.what}</p>
                {sub.detail && (
                  <p className="mt-2 text-xs font-mono text-ink-400">{sub.detail}</p>
                )}
              </div>
              <span
                className={`shrink-0 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                  sub.ok
                    ? "bg-teal/15 text-ink-900 border border-teal/50"
                    : "bg-coral/15 text-ink-900 border border-coral/50"
                }`}
                aria-label={sub.ok ? "operational" : "degraded"}
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 rounded-full ${sub.ok ? "bg-teal animate-pulse" : "bg-coral"}`}
                />
                {sub.ok ? "Operational" : "Degraded"}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <section className="mt-10 card p-5 text-sm text-ink-600">
        <h2 className="font-serif text-xl text-ink-900 mb-2">What we measure here</h2>
        <p>
          This page reflects the same checks as <code>/api/health</code>: the DB
          + pgvector are required; the KMS is required for Sahay's encrypted
          mode; the LLM and embeddings providers are warned-on rather than
          required. We deliberately do <strong>not</strong> make billable calls
          to AI providers from this probe; the nightly{" "}
          <Link href="/about/model" className="underline">
            adversarial eval
          </Link>{" "}
          covers correctness.
        </p>
      </section>

      <p className="mt-6 text-xs text-ink-400">
        Need the JSON?{" "}
        <Link href="/api/health" className="underline">
          /api/health
        </Link>{" "}
        returns the same payload (200 OK · 503 if a required subsystem is down).
      </p>
    </div>
  );
}
