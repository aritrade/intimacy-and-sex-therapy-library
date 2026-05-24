import Link from "next/link";
import { notFound } from "next/navigation";
import { getPath, PATHS } from "@/lib/paths/seeds";

export function generateStaticParams() {
  return PATHS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const p = getPath(params.slug);
  return p
    ? { title: `${p.title} · Intimacy & Sex Therapy Library` }
    : { title: "Path not found" };
}

export default function PathDetail({ params }: { params: { slug: string } }) {
  const path = getPath(params.slug);
  if (!path) notFound();

  return (
    <div className="container-page py-10 max-w-3xl">
      <header className="mb-8">
        <p className={`pill-${path.accent} w-fit`}>Path · {path.duration}</p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">{path.title}</h1>
        <p className="mt-1 text-sm text-ink-400">For: {path.audience}</p>
        <p className="mt-3 text-ink-600 max-w-prose">{path.summary}</p>
      </header>

      <ol className="space-y-4">
        {path.steps.map((step, idx) => (
          <li key={step.id} className="card p-5">
            <header className="flex items-baseline gap-3">
              <span className="font-serif text-2xl text-ink-400">{idx + 1}</span>
              <h2 className="font-serif text-xl text-ink-900">{step.title}</h2>
            </header>
            <p className="mt-3 text-ink-700 leading-relaxed">{step.primer}</p>
            {step.reflection && (
              <div className="mt-3 rounded-xl border border-accent/30 bg-accent-soft p-3 text-sm">
                <p className="text-[11px] uppercase tracking-wider text-accent-ink font-semibold">
                  Try this
                </p>
                <p className="mt-1 text-accent-ink">{step.reflection}</p>
              </div>
            )}
            {step.resources && step.resources.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {step.resources.map((r) => (
                  <li key={r.href}>
                    <Link href={r.href} className="pill hover:border-accent/40 hover:bg-accent-soft hover:text-accent-ink">
                      {r.label} →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      <footer className="mt-10 card p-5">
        <p className="text-sm text-ink-600">
          When you&apos;re ready to talk to someone, browse{" "}
          <Link href="/clinicians" className="underline">India-aware clinicians</Link>, or{" "}
          <Link href="/companion" className="underline">talk to Sahay</Link> if you want to
          warm up first.
        </p>
      </footer>
    </div>
  );
}
