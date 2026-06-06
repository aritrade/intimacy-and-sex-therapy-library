import { notFound } from "next/navigation";
import { INSTRUMENTS, type AssessmentId } from "@/lib/assessments/instruments";
import { AssessmentForm } from "@/components/AssessmentForm";

const VALID = Object.keys(INSTRUMENTS) as AssessmentId[];

export function generateStaticParams() {
  return VALID.map((id) => ({ id }));
}

export function generateMetadata({ params }: { params: { id: string } }) {
  const inst = INSTRUMENTS[params.id as AssessmentId];
  return inst
    ? { title: `${inst.shortName} · Intimacy & Sex Therapy Library` }
    : { title: "Assessment not found · Intimacy & Sex Therapy Library" };
}

export default function AssessmentPage({ params }: { params: { id: string } }) {
  if (!VALID.includes(params.id as AssessmentId)) notFound();
  const inst = INSTRUMENTS[params.id as AssessmentId];

  return (
    <div className="container-page py-10 max-w-3xl">
      <header className="mb-6">
        <p className="pill-accent w-fit">{inst.shortName}</p>
        <h1 className="mt-3 font-serif text-3xl text-ink-900">{inst.name}</h1>
        <p className="mt-2 text-ink-600">{inst.description}</p>
        <p className="mt-2 text-xs text-ink-400">{inst.attribution}</p>
      </header>

      <AssessmentForm instrument={inst} />
    </div>
  );
}
