import { listClinicians } from "@/lib/db/queries";

export const metadata = {
  title: "Find a clinician · Intimacy & Sex Therapy Library",
  description:
    "India-first directory of verified RCI / AASECT / WPATH / ESSM-affiliated clinicians who specialise in sexual health, intimacy, and affirming care.",
};

export const dynamic = "force-dynamic";

const DEFAULT_REGIONS: Array<{ code: string; label: string }> = [
  { code: "IN", label: "India" },
  { code: "US", label: "United States" },
  { code: "UK", label: "United Kingdom" },
  { code: "AE", label: "UAE" },
  { code: "SG", label: "Singapore" },
];

const APPLY_EMAIL = "directory@example.invalid";

export default async function CliniciansPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const country =
    (typeof searchParams.country === "string" ? searchParams.country : "IN") || "IN";
  const all = await listClinicians(country);

  const realEntries = all.filter((c) => !c.name.startsWith("[VERIFY]"));
  const placeholderEntries = all.filter((c) => c.name.startsWith("[VERIFY]"));
  const allArePlaceholders = realEntries.length === 0 && placeholderEntries.length > 0;

  return (
    <div className="container-page py-10 max-w-5xl">
      <header className="mb-6 max-w-3xl">
        <p className="pill-accent w-fit">Find help</p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">
          Find a clinician
        </h1>
        <p className="mt-2 text-ink-600">
          India-first. Every listing is a verified, consenting clinician with RCI / AASECT
          / WPATH / ESSM credentials. We don&apos;t accept paid placement; entries are
          curator-reviewed.
        </p>
        <p className="mt-2 text-sm text-ink-400">
          If you&apos;re in immediate crisis, the floating button at the bottom right has
          local hotlines.
        </p>
      </header>

      {allArePlaceholders && (
        <div
          role="status"
          className="mb-6 card p-4 text-sm border-warn/40 bg-warn/5"
        >
          <p className="text-ink-900">
            <strong>Directory is in seed mode.</strong> These cards are intentional{" "}
            <code>[VERIFY]</code> placeholders — not real clinicians. We won&apos;t list
            anyone without their explicit consent and credential verification, so
            we&apos;re showing the structure of the directory while we onboard real
            practitioners.
          </p>
          <p className="mt-2 text-ink-600">
            Are you a credentialed clinician (RCI / AASECT / WPATH / ESSM) who&apos;d like
            to be listed?{" "}
            <a
              className="underline hover:text-ink-900"
              href={`mailto:${APPLY_EMAIL}?subject=Clinician%20directory%20application`}
            >
              Apply to join the directory →
            </a>
          </p>
        </div>
      )}

      <nav aria-label="Region filter" className="mb-6 flex flex-wrap gap-2">
        {DEFAULT_REGIONS.map((r) => (
          <a
            key={r.code}
            href={`/clinicians?country=${r.code}`}
            className={`pill ${country === r.code ? "pill-accent" : ""}`}
          >
            {r.label}
          </a>
        ))}
      </nav>

      {all.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {realEntries.map((c) => (
            <li key={c.id}>
              <ClinicianCard c={c} placeholder={false} />
            </li>
          ))}
          {placeholderEntries.map((c) => (
            <li key={c.id}>
              <ClinicianCard c={c} placeholder />
            </li>
          ))}
        </ul>
      )}

      {!allArePlaceholders && placeholderEntries.length === 0 && realEntries.length > 0 && (
        <p className="mt-8 text-xs text-ink-400">
          Are you a credentialed clinician?{" "}
          <a
            className="underline hover:text-ink-900"
            href={`mailto:${APPLY_EMAIL}?subject=Clinician%20directory%20application`}
          >
            Apply to be listed
          </a>
          .
        </p>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card p-8 text-sm text-ink-600">
      <h2 className="font-serif text-xl text-ink-900 mb-2">No verified entries yet</h2>
      <p>
        We only list clinicians who have explicitly consented to appear in this
        directory. The directory will populate once we&apos;ve verified our first
        practitioners for this region.
      </p>
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

function ClinicianCard({ c, placeholder }: { c: Clinician; placeholder: boolean }) {
  const cleanName = placeholder ? c.name.replace(/^\[VERIFY\]\s*/, "") : c.name;

  return (
    <article
      className={`card p-5 h-full flex flex-col ${
        placeholder ? "border-dashed opacity-80" : ""
      }`}
      aria-label={placeholder ? `Placeholder entry: ${cleanName}` : cleanName}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {placeholder && (
          <span
            className="pill border-warn/40 bg-warn/10 text-warn-ink"
            title="Placeholder seed entry — not a real clinician."
          >
            Placeholder
          </span>
        )}
        {c.teleConsult && <span className="pill-teal">Tele-consult</span>}
        <span className="pill">{c.affordability}</span>
        {c.city && <span className="pill">{c.city}</span>}
      </div>

      <h2 className="mt-3 font-serif text-lg text-ink-900">
        {cleanName}
        {placeholder && (
          <span className="ml-2 align-middle text-xs text-ink-400 font-sans font-normal">
            (template)
          </span>
        )}
      </h2>

      <p className="mt-1 text-sm text-ink-600">
        {(c.credentials as string[]).join(" · ")}
      </p>
      <p className="mt-2 text-xs text-ink-400">
        Languages: {(c.languages as string[]).join(", ")}
      </p>
      <p className="mt-1 text-xs text-ink-400">
        Modalities: {(c.modalities as string[]).join(", ")}
      </p>

      {placeholder ? (
        <p className="mt-3 text-sm text-ink-500 italic">
          What a real listing looks like. Once we&apos;ve verified a clinician with this
          profile, this card will become contactable.
        </p>
      ) : (
        c.notes && <p className="mt-3 text-sm text-ink-700">{c.notes}</p>
      )}

      {!placeholder && c.contactUrl && (
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
