import Link from "next/link";
import { TriageWizard } from "@/components/assessments/TriageWizard";

export const metadata = {
  title: "Find the right assessment · Intimacy & Sex Therapy Library",
  description:
    "Answer a few quick questions and we'll suggest the validated self-assessments most relevant to what you're experiencing.",
};

export default function TriagePage() {
  return (
    <div className="container-page py-10 max-w-3xl">
      <header className="mb-6">
        <p className="pill-accent w-fit">Guided start</p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">
          Find the right assessment
        </h1>
        <p className="mt-2 text-ink-600 max-w-prose">
          A quick way to narrow things down. Your selections stay in your browser — nothing is
          sent anywhere. This points you to validated questionnaires; it isn’t a diagnosis.
        </p>
        <p className="mt-2 text-sm text-ink-400">
          <Link href="/assessments" className="underline hover:text-ink-900">
            Or browse all assessments →
          </Link>
        </p>
      </header>

      <TriageWizard />
    </div>
  );
}
