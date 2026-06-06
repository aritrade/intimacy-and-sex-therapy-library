import Link from "next/link";
import { ReflectionPanel } from "@/components/assessments/ReflectionPanel";

export const metadata = {
  title: "Screening reflection · Intimacy & Sex Therapy Library",
  description:
    "A supportive, plain-language reflection that pulls your self-assessment results together and suggests next steps. Educational screening, never a diagnosis.",
};

export default function ReflectionPage() {
  return (
    <div className="container-page py-10 max-w-3xl">
      <header className="mb-6">
        <p className="pill-plum w-fit">Screening companion</p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">
          Make sense of your results
        </h1>
        <p className="mt-2 text-ink-600 max-w-prose">
          This brings together the self-assessments you’ve completed and offers a gentle,
          plain-language reflection plus next steps. It runs on results held only in your browser,
          and it is <strong>not</strong> a diagnosis — it’s here to help you decide what to explore
          and when to reach out to a clinician.
        </p>
        <p className="mt-2 text-sm text-ink-400">
          <Link href="/assessments" className="underline hover:text-ink-900">← Back to assessments</Link>
        </p>
      </header>

      <ReflectionPanel />
    </div>
  );
}
