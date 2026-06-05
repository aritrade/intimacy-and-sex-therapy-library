import { listClinicians } from "@/lib/db/queries";
import { searchClinicians, aggregationConfigured } from "@/lib/help/search";
import { specialtyById, type AffirmingFilter } from "@/lib/help/taxonomy";
import { FindHelpTabs } from "@/components/help/FindHelpTabs";
import { HelpSearchForm } from "@/components/help/HelpSearchForm";
import { HelpResultCard } from "@/components/help/HelpResultCard";

export const metadata = {
  title: "Find a clinician · Intimacy & Sex Therapy Library",
  description:
    "India-first directory of verified RCI / AASECT / WPATH / ESSM-affiliated clinicians, plus an inclusive aggregated search of public listings for sexual health, intimacy, and affirming care.",
};

export const dynamic = "force-dynamic";

const APPLY_EMAIL = "directory@example.invalid";
const VALID_AFFIRMING: AffirmingFilter[] = ["lgbtq", "trans", "ace"];

function parseAffirming(raw: string | undefined): AffirmingFilter[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is AffirmingFilter => (VALID_AFFIRMING as string[]).includes(s));
}

export default async function CliniciansPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const str = (k: string) =>
    typeof searchParams[k] === "string" ? (searchParams[k] as string) : undefined;

  const country = str("country") || "IN";
  const state = str("state");
  const locality = str("locality");
  const specialty = str("specialty");
  const affirming = parseAffirming(str("affirming"));
  const submitted = str("go") === "1";

  const verified = (await listClinicians(country)).filter(
    (c) => !c.name.startsWith("[VERIFY]"),
  );

  // Aggregated clinician search uses a general web search (and Google Places
  // too, when configured), so it works without Maps.
  const agg = aggregationConfigured();
  const aggregated =
    submitted && specialty && agg.any
      ? await searchClinicians({ country, state, locality, specialtyId: specialty, affirming })
      : null;

  return (
    <div className="container-page py-10 max-w-5xl">
      <header className="mb-6 max-w-3xl">
        <p className="pill-accent w-fit">Find help</p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">Find a clinician</h1>
        <p className="mt-2 text-ink-600">
          Verified, consenting clinicians sit at the top. Below, an inclusive AI search surfaces
          public listings near you. We welcome everyone — every orientation, gender identity,
          relationship structure, and body.
        </p>
        <p className="mt-2 text-sm text-ink-400">
          If you&apos;re in immediate crisis, the floating button at the bottom right has local
          hotlines.
        </p>
      </header>

      <FindHelpTabs />

      <HelpSearchForm
        mode="clinician"
        initial={{ country, state, locality, specialty, affirming }}
      />

      {/* Verified tier */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <h2 className="font-serif text-xl text-ink-900">Verified clinicians</h2>
          <span className="pill-accent">Curator-reviewed</span>
        </div>
        <p className="mt-1 text-sm text-ink-500">
          RCI / AASECT / WPATH / ESSM credentials, listed only with explicit consent. No paid
          placement.
        </p>

        {verified.length === 0 ? (
          <div className="mt-4 card p-6 text-sm text-ink-600">
            <p>
              No verified entries for this region yet. Are you a credentialed clinician?{" "}
              <a
                className="underline hover:text-ink-900"
                href={`mailto:${APPLY_EMAIL}?subject=Clinician%20directory%20application`}
              >
                Apply to be listed →
              </a>
            </p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {verified.map((c) => (
              <li key={c.id}>
                <ClinicianCard c={c} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Aggregated public tier */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <h2 className="font-serif text-xl text-ink-900">More options near you</h2>
          <span className="pill-plum">Public listings</span>
        </div>
        <p className="mt-1 text-sm text-ink-500">
          A web-wide search of public listings and reputable directories, ranked for relevance and
          inclusivity. These are not verified by us — please check credentials before booking.
        </p>

        {!agg.any ? (
          <div className="mt-4 card p-6 text-sm text-ink-600">
            Web search isn&apos;t configured yet, so this section is off. The verified directory
            above is fully available.
          </div>
        ) : !submitted || !specialty ? (
          <div className="mt-4 card p-6 text-sm text-ink-600">
            Choose what you&apos;re looking for and a location above, then search to see public
            listings.
          </div>
        ) : aggregated && aggregated.results.length > 0 ? (
          <>
            <ul className="mt-4 grid gap-4 md:grid-cols-2">
              {aggregated.results.map((r) => (
                <li key={r.ref}>
                  <HelpResultCard result={r} />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-400">
              Showing public listings for {specialtyById(specialty)?.label ?? specialty}
              {aggregated.cached ? " · cached" : ""}. Spotted something wrong? Use “Report” on any
              card.
            </p>
          </>
        ) : (
          <div className="mt-4 card p-6 text-sm text-ink-600">
            No public listings matched. Try a broader location or a related specialty.
          </div>
        )}
      </section>
    </div>
  );
}

type Clinician = {
  id: string;
  name: string;
  credentials: unknown;
  languages: unknown;
  modalities: unknown;
  city: string | null;
  affordability: string;
  teleConsult: boolean;
  contactUrl: string | null;
  notes: string | null;
};

function ClinicianCard({ c }: { c: Clinician }) {
  return (
    <article className="card p-5 h-full flex flex-col" aria-label={c.name}>
      <div className="flex flex-wrap items-center gap-1.5">
        {c.teleConsult && <span className="pill-teal">Tele-consult</span>}
        <span className="pill">{c.affordability}</span>
        {c.city && <span className="pill">{c.city}</span>}
      </div>

      <h3 className="mt-3 font-serif text-lg text-ink-900">{c.name}</h3>
      <p className="mt-1 text-sm text-ink-600">{(c.credentials as string[]).join(" · ")}</p>
      <p className="mt-2 text-xs text-ink-400">
        Languages: {(c.languages as string[]).join(", ")}
      </p>
      <p className="mt-1 text-xs text-ink-400">
        Modalities: {(c.modalities as string[]).join(", ")}
      </p>

      {c.notes && <p className="mt-3 text-sm text-ink-700">{c.notes}</p>}

      {c.contactUrl && (
        <a
          href={c.contactUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 btn-secondary self-start"
        >
          Contact
        </a>
      )}
    </article>
  );
}
