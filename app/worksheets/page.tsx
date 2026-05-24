import worksheets from "@/content/worksheets.json";
import Link from "next/link";

type Worksheet = {
  id: string;
  title: string;
  audience: string;
  minutes: number;
  intro: string;
  sections: Array<{ heading: string; bullets: string[] }>;
};

export const metadata = {
  title: "Worksheets · Intimacy & Sex Therapy Library",
  description: "Printable, clinician-vetted worksheets for self-paced and couple work.",
};

export default function WorksheetsPage() {
  const items = worksheets.worksheets as Worksheet[];

  return (
    <div className="container-page py-10 max-w-3xl">
      <header className="mb-8">
        <p className="pill-teal w-fit">Worksheets</p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">Printable worksheets</h1>
        <p className="mt-2 text-ink-600">
          Short, clinician-vetted exercises you can use alone or with a partner. Open one
          and use your browser&apos;s print function to save it as a PDF.
        </p>
      </header>

      <ul className="space-y-4">
        {items.map((w) => (
          <li key={w.id}>
            <Link href={`#${w.id}`} className="card card-hover p-5 block">
              <div className="flex items-center gap-2">
                <span className="pill-accent">{w.audience}</span>
                <span className="pill">{w.minutes} min</span>
              </div>
              <h2 className="mt-3 font-serif text-xl text-ink-900">{w.title}</h2>
              <p className="mt-2 text-sm text-ink-600">{w.intro}</p>
            </Link>
          </li>
        ))}
      </ul>

      <hr className="my-10 border-border" />

      {items.map((w) => (
        <article key={w.id} id={w.id} className="card p-6 mt-6">
          <h2 className="font-serif text-2xl text-ink-900">{w.title}</h2>
          <p className="mt-2 text-sm text-ink-400">
            {w.audience} · {w.minutes} min
          </p>
          <p className="mt-3 text-ink-700 max-w-prose">{w.intro}</p>
          <div className="mt-5 space-y-5">
            {w.sections.map((s) => (
              <section key={s.heading}>
                <h3 className="font-medium text-ink-900">{s.heading}</h3>
                <ul className="mt-2 space-y-1.5 list-disc pl-5 text-ink-700">
                  {s.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <p className="mt-5 text-xs text-ink-400 print:hidden">
            Tip: use your browser&apos;s print menu (Cmd/Ctrl + P) to save as PDF.
          </p>
        </article>
      ))}
    </div>
  );
}
