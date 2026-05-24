import Link from "next/link";
import { PATHS } from "@/lib/paths/seeds";

export const metadata = {
  title: "Learning paths · Intimacy & Sex Therapy Library",
  description: "Step-by-step, clinician-vetted journeys for couples, low desire, performance anxiety, and LGBTQ+-affirming intimacy.",
};

export default function PathsHome() {
  return (
    <div className="container-page py-10 max-w-5xl">
      <header className="mb-8 max-w-3xl">
        <p className="pill-teal w-fit">Follow</p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">Learning paths</h1>
        <p className="mt-2 text-ink-600">
          Curator-authored, clinician-reviewed journeys you can move through at your own
          pace. Each step links to evidence in the catalog.
        </p>
      </header>

      <ul className="grid gap-4 md:grid-cols-2">
        {PATHS.map((p) => (
          <li key={p.slug}>
            <Link href={`/paths/${p.slug}`} className="card card-hover p-5 h-full flex flex-col group">
              <span className={`pill-${p.accent} w-fit`}>{p.duration}</span>
              <h2 className="mt-3 font-serif text-xl text-ink-900 group-hover:text-accent-ink">
                {p.title}
              </h2>
              <p className="mt-1 text-sm text-ink-400">For: {p.audience}</p>
              <p className="mt-3 text-sm text-ink-600 flex-1">{p.summary}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm text-accent-ink group-hover:gap-2 transition-all">
                Start path <span aria-hidden>→</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
