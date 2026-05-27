import Link from "next/link";
import { cookies } from "next/headers";
import { AgeGateWithReload } from "@/components/AgeGateWithReload";
import { ContinueReadingShelf } from "@/components/ContinueReadingShelf";
import { IntakeQuiz } from "@/components/IntakeQuiz";
import { VideoShelf } from "@/components/VideoShelf";
import { EmailSignup } from "@/components/EmailSignup";
import { FeedbackForm } from "@/components/FeedbackForm";
import { listFeaturedVideos } from "@/lib/db/queries";
import { currentStrings } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const AGE_COOKIE = "stl_age_18";

export default async function HomePage() {
  const cookieStore = cookies();
  const confirmed = cookieStore.get(AGE_COOKIE)?.value === "1";

  if (!confirmed) {
    return <Welcome />;
  }

  const featuredVideos = await listFeaturedVideos(6);

  return (
    <>
      <Hero hasVideos={featuredVideos.length > 0} />
      <IntakeQuiz />
      <VideoShelf items={featuredVideos} />
      <ContinueReadingShelf />
      <Surfaces />
      <Topics />
      <Trust />
    </>
  );
}

function Welcome() {
  const strings = currentStrings();
  return (
    <div className="container-page py-12 grid gap-8 md:grid-cols-[1.2fr_1fr] items-center">
      <section className="animate-fade-up">
        <p className="pill-accent w-fit">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
          Curated · Clinician-reviewed · India-aware
        </p>
        <h1 className="mt-4 font-serif text-4xl sm:text-5xl text-ink-900 leading-[1.05]">
          Honest, evidence-based help for{" "}
          <span className="text-gradient">intimacy, desire, and relationships</span>.
        </h1>
        <p className="mt-4 max-w-prose text-ink-600">{strings.brand.tagline}</p>
        <p className="mt-6 max-w-prose text-sm text-ink-400">
          We never host copyrighted books. Open-access full text where licensed; for
          copyrighted works, curator notes and authorized links to publishers and
          libraries.
        </p>
      </section>
      <div className="animate-fade-up space-y-4">
        <AgeGateWithReload />
        <EmailSignup
          variant="card"
          title="Or get a weekly digest"
          blurb="Plain-language explainers, new resources, and crisis-line updates — one short email a week."
        />
      </div>
    </div>
  );
}

function Hero({ hasVideos }: { hasVideos: boolean }) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-warm opacity-90"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-20 h-96 w-96 rounded-full bg-plum/10 blur-3xl animate-float"
      />
      <div className="container-page relative pt-14 pb-16 sm:pt-20 sm:pb-24">
        <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:items-start">
          <div className="animate-fade-up">
            <p className="pill-accent w-fit">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
              Curated · Clinician-reviewed · India-aware
            </p>
            <h1 className="mt-5 font-serif text-4xl sm:text-6xl text-ink-900 leading-[1.02] tracking-tight">
              Honest help for{" "}
              <span className="text-gradient">intimacy, desire, and relationships</span>.
            </h1>
            <p className="mt-5 max-w-prose text-lg text-ink-600">
              A library of sex-therapy education from AASECT, WPATH, WHO, NIH, peer-reviewed
              journals and accredited universities — plus <strong>Sahay</strong>, an
              India-aware companion designed with confidentiality and warmth in mind.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/catalog" className="btn-primary">
                Explore the catalog →
              </Link>
              {hasVideos && (
                <a href="#videos" className="btn-secondary">
                  Watch a 5-minute primer
                </a>
              )}
              <Link href="/companion" className="btn-ghost">
                Talk to Sahay
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap items-center gap-2 text-xs text-ink-400">
              <li className="pill">
                <span aria-hidden>♡</span> 18+ · educational only
              </li>
              <li className="pill">
                <span aria-hidden>⌘</span> No tracking cookies
              </li>
              <li className="pill">
                <span aria-hidden>✱</span> Encryption by default
              </li>
              <li className="pill">
                <span aria-hidden>⚐</span> India-first crisis routing
              </li>
            </ul>
          </div>

          <aside className="animate-fade-up lg:pt-2 space-y-4" aria-label="Newsletter signup and feedback">
            <EmailSignup
              variant="card"
              title="Get the weekly digest"
              blurb="One short email a week — new explainers, plain-language summaries, and crisis-resource updates. Unsubscribe anytime."
            />
            <FeedbackForm />
          </aside>
        </div>
      </div>
    </section>
  );
}

const SURFACES = [
  {
    href: "/catalog",
    badge: "Read",
    title: "Curated catalog",
    body: "Articles, videos, and chapters tagged beginner / intermediate / advanced. Every entry is reviewed before it goes live.",
    accent: "plum" as const,
  },
  {
    href: "/paths",
    badge: "Follow",
    title: "Learning paths",
    body: "Step-by-step journeys for couples reset, sexless marriage, anxiety/ED, and LGBTQ+-affirming care.",
    accent: "teal" as const,
  },
  {
    href: "/library",
    badge: "Open",
    title: "Virtual library",
    body: "Books and reports — open-access PDFs read inline; copyrighted titles surfaced with curator notes and authorized deep-links.",
    accent: "coral" as const,
  },
  {
    href: "/chat",
    badge: "Ask",
    title: "Cite-everything chatbot",
    body: "Answers strictly from the curated corpus, with [n] citations on every claim. If it doesn’t know, it says so.",
    accent: "plum" as const,
  },
  {
    href: "/companion",
    badge: "Sahay",
    title: "An AI wellness companion",
    body: "Warm, India-aware, never a replacement for a clinician. Three confidentiality modes including zero-knowledge vault.",
    accent: "teal" as const,
  },
  {
    href: "/assessments",
    badge: "Reflect",
    title: "Self-assessments",
    body: "PHQ-9, GAD-7, and the New Sexual Satisfaction Scale — privately scored, never shared.",
    accent: "coral" as const,
  },
];

function Surfaces() {
  return (
    <section className="container-page py-14">
      <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-serif text-3xl text-ink-900">What you can do here</h2>
          <p className="mt-2 text-ink-600 max-w-prose">
            Pick a surface based on what you need today. You can switch any time.
          </p>
        </div>
        <Link
          href="/about/model"
          className="text-sm text-accent-ink underline-offset-4 hover:underline"
        >
          How it works →
        </Link>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {SURFACES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="card card-hover group p-5 flex flex-col"
          >
            <div className="flex items-center gap-2">
              <span className={`pill-${s.accent}`}>{s.badge}</span>
            </div>
            <h3 className="mt-3 font-serif text-xl text-ink-900">{s.title}</h3>
            <p className="mt-2 text-sm text-ink-600 flex-1">{s.body}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm text-accent-ink group-hover:gap-2 transition-all">
              Open <span aria-hidden>→</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

const TOPIC_GROUPS: Array<{ heading: string; chips: string[]; href: string }> = [
  {
    heading: "Couples & relationships",
    chips: [
      "Couple counselling",
      "Sexless marriage",
      "Desire discrepancy",
      "Open relationships",
      "Situationships",
    ],
    href: "/catalog?topic=couple_counselling",
  },
  {
    heading: "Common concerns",
    chips: [
      "Vaginismus",
      "Erectile dysfunction",
      "Performance anxiety",
      "Low desire",
      "Pain with sex",
    ],
    href: "/catalog?topic=erectile_dysfunction",
  },
  {
    heading: "Identity & affirming care",
    chips: ["LGBTQ+ affirming", "Asexual spectrum", "WPATH SOC8", "Coming out", "Family of origin"],
    href: "/catalog?topic=ace_spectrum",
  },
  {
    heading: "Body & mind",
    chips: [
      "Trauma-informed",
      "Shame & guilt",
      "Porn-related distress",
      "Compulsive sexual behavior",
      "Mindfulness",
    ],
    href: "/catalog?topic=sexual_trauma",
  },
];

function Topics() {
  return (
    <section className="bg-elevated/40 border-y border-border">
      <div className="container-page py-14">
        <h2 className="font-serif text-3xl text-ink-900">What we cover</h2>
        <p className="mt-2 text-ink-600 max-w-prose">
          Browse by what feels relevant — every chip is a curated entry into the catalog.
        </p>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {TOPIC_GROUPS.map((g) => (
            <div key={g.heading} className="card p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-ink-900">{g.heading}</h3>
                <Link href={g.href} className="text-sm text-accent-ink hover:underline">
                  See all →
                </Link>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {g.chips.map((c) => (
                  <li key={c}>
                    <Link
                      href={g.href}
                      className="pill hover:border-accent/40 hover:bg-accent-soft hover:text-accent-ink transition-colors"
                    >
                      {c}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Trust() {
  return (
    <section className="container-page py-14">
      <div className="grid gap-6 md:grid-cols-3">
        <TrustCard
          title="Reviewed by clinicians"
          body="Every resource is screened by an Advisory Board of RCI / AASECT / ESSM-affiliated clinicians before it goes live."
          href="/about/clinical-board"
          cta="Meet the board"
        />
        <TrustCard
          title="Encryption by default"
          body="Sahay conversations are encrypted at rest. A zero-knowledge Vault mode keeps even our servers from reading them."
          href="/about/privacy"
          cta="See the privacy notice"
        />
        <TrustCard
          title="Open about our limits"
          body="A public model card lists what the AI can and cannot do, with refusal categories and red-team eval results."
          href="/about/model"
          cta="Read the model card"
        />
      </div>
    </section>
  );
}

function TrustCard({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="card p-5 flex flex-col">
      <h3 className="font-serif text-xl text-ink-900">{title}</h3>
      <p className="mt-2 text-sm text-ink-600 flex-1">{body}</p>
      <Link href={href} className="mt-4 text-sm text-accent-ink hover:underline">
        {cta} →
      </Link>
    </div>
  );
}
