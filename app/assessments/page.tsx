import Link from "next/link";
import { INSTRUMENTS, LICENSED_LATER } from "@/lib/assessments/instruments";

export const metadata = {
  title: "Self-assessments · Intimacy & Sex Therapy Library",
  description: "Validated self-assessments — PHQ-9, GAD-7, and the NSSS — privately scored in your browser.",
};

const ACTIVE = Object.values(INSTRUMENTS);

export default function AssessmentsHomePage() {
  return (
    <div className="container-page py-10 max-w-5xl">
      <header className="mb-8 max-w-3xl">
        <p className="pill-coral w-fit">Reflect</p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">Self-assessments</h1>
        <p className="mt-2 text-ink-600">
          Validated questionnaires used by clinicians worldwide. Your answers are scored in
          your browser and never stored on our servers unless you explicitly opt in.
        </p>
        <p className="mt-2 text-sm text-ink-400">
          These are screening tools, not diagnoses. If your score is in the higher range,
          we recommend reaching out to a qualified clinician.
        </p>
      </header>

      <section aria-label="Available assessments">
        <h2 className="font-serif text-2xl text-ink-900 mb-4">Available now</h2>
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ACTIVE.map((i) => (
            <li key={i.id}>
              <Link href={`/assessments/${i.id}`} className="card card-hover p-5 h-full flex flex-col group">
                <span className="pill-accent w-fit">{i.shortName}</span>
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
