import Link from "next/link";
import {
  CATEGORY_LABEL,
  LICENSED_LATER,
  instrumentsByCategory,
} from "@/lib/assessments/instruments";

export const metadata = {
  title: "Self-assessments · Intimacy & Sex Therapy Library",
  description:
    "A library of validated, privately-scored self-assessments across mood, anxiety, stress, trauma, relationships, and sexual health — with a guided way to find the right one.",
};

const GROUPS = instrumentsByCategory();

export default function AssessmentsHomePage() {
  return (
    <div className="container-page py-10 max-w-5xl">
      <header className="mb-8 max-w-3xl">
        <p className="pill-coral w-fit">Reflect</p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">Self-assessments</h1>
        <p className="mt-2 text-ink-600">
          Validated questionnaires used by clinicians worldwide, spanning emotional well-being,
          relationships, and sexual health. Your answers are scored in your browser and never
          stored on our servers unless you explicitly opt in.
        </p>
        <p className="mt-2 text-sm text-ink-400">
          These are screening tools, not diagnoses. If a result lands in a higher range, we
          recommend reaching out to a qualified clinician.
        </p>
      </header>

      <section aria-labelledby="triage-cta" className="mb-10">
        <div className="card p-6 sm:p-7 bg-accent-soft border-accent/30">
          <h2 id="triage-cta" className="font-serif text-xl sm:text-2xl text-ink-900">
            Not sure where to start?
          </h2>
          <p className="mt-2 text-ink-700 max-w-prose">
            Answer a handful of quick questions and we’ll suggest the assessments most relevant
            to what you’re experiencing right now. Takes about a minute.
          </p>
          <Link href="/assessments/triage" className="mt-4 inline-block btn-primary">
            Find my assessments →
          </Link>
        </div>
      </section>

      {GROUPS.map(({ category, items }) => (
        <section key={category} aria-label={CATEGORY_LABEL[category]} className="mb-10">
          <h2 className="font-serif text-2xl text-ink-900 mb-4">{CATEGORY_LABEL[category]}</h2>
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((i) => (
              <li key={i.id}>
                <Link href={`/assessments/${i.id}`} className="card card-hover p-5 h-full flex flex-col group">
                  <div className="flex items-center justify-between gap-2">
                    <span className="pill-accent w-fit">{i.shortName}</span>
                    {i.estMinutes != null && (
                      <span className="text-xs text-ink-400">{i.estMinutes} min</span>
                    )}
                  </div>
                  <h3 className="mt-3 font-serif text-lg text-ink-900 group-hover:text-accent-ink">
                    {i.name}
                  </h3>
                  <p className="mt-2 text-sm text-ink-600 flex-1">{i.description}</p>
                  <div className="mt-4 text-xs text-ink-400">{i.attribution}</div>
                  <span className="mt-2 inline-flex items-center gap-1 text-sm text-accent-ink group-hover:gap-2 transition-all">
                    Begin <span aria-hidden>→</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section aria-label="Coming after licensing" className="mt-12">
        <h2 className="font-serif text-2xl text-ink-900 mb-4">Available after licensing</h2>
        <p className="text-sm text-ink-600 mb-4 max-w-prose">
          These instruments are widely used in clinical practice and require commercial
          licensing from their copyright holders. We will not ship them until licensing is
          in place.
        </p>
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {LICENSED_LATER.map((i) => (
            <li key={i.id}>
              <article className="card p-5 h-full flex flex-col opacity-80">
                <span className="pill w-fit">Pending licensing</span>
                <h3 className="mt-3 font-serif text-lg text-ink-900">{i.name}</h3>
                <p className="mt-2 text-sm text-ink-600 flex-1">{i.about}</p>
              </article>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
