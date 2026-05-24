import { Companion } from "@/components/Companion";
import { isLlmConfigured } from "@/lib/ai/llm";
import { currentLocale } from "@/lib/i18n/server";

export const metadata = {
  title: "Sahay — your AI wellness companion · Intimacy & Sex Therapy Library",
  description:
    "A warm, India-aware AI wellness companion. Three confidentiality modes, English/Hindi/Hinglish, and a clinician handoff at every turn. Not a replacement for a therapist.",
};

export const dynamic = "force-dynamic";

export default function CompanionPage() {
  const configured = isLlmConfigured();
  const initialLocale = currentLocale();

  return (
    <div className="container-page py-10 max-w-5xl">
      <header className="mb-6 max-w-2xl">
        <p className="pill-plum w-fit">Sahay · सहाय</p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">
          A wellness companion for the things you don&apos;t want to say out loud.
        </h1>
        <p className="mt-2 text-ink-600">
          Sahay is not a therapist or doctor. It&apos;s a companion designed to make the
          first step easier — to listen, to validate, to point you to evidence, and, when
          the moment is right, to a human.
        </p>
        <p className="mt-2 text-sm text-ink-400">
          You can talk in English, Hindi, or Hinglish. You can stay anonymous. You can
          choose how confidential this conversation is. Three modes are listed on the right.
        </p>
      </header>

      <Companion configured={configured} initialLocale={initialLocale} />
    </div>
  );
}
