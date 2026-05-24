import { DecisionTree } from "@/components/DecisionTree";

export const metadata = {
  title: "Should I start sex therapy? · Intimacy & Sex Therapy Library",
  description:
    "A small decision aid that helps you understand whether self-guided learning, a couples path, or a clinician is the most evidence-based next step for you.",
};

export default function DecidePage() {
  return (
    <div className="container-page py-10 max-w-3xl">
      <header className="mb-6">
        <p className="pill-plum w-fit">Decision aid</p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">
          Should I start sex therapy?
        </h1>
        <p className="mt-2 text-ink-600">
          A few short questions that lead to an evidence-informed recommendation. There is
          never a wrong answer; you can always come back.
        </p>
      </header>
      <DecisionTree />
    </div>
  );
}
