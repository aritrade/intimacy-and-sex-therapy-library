import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts } from "@/lib/db/schema";
import { DraftCreateForm } from "@/components/admin/DraftCreateForm";
import { draftStateCounts } from "@/lib/admin/stats";
import { requireAdminPage } from "@/lib/auth/admin-page-guard";

export const metadata = { title: "Drafts · Admin" };
export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, string> = {
  script_draft: "pill",
  clinician_reviewed: "pill-accent",
  rendered: "pill-teal",
  editor_reviewed: "pill-plum",
  scheduled: "pill-plum",
  posted: "pill-teal",
  failed: "pill-coral",
  taken_down: "pill-coral",
};

const KNOWN_STATUSES = [
  "script_draft",
  "clinician_reviewed",
  "rendered",
  "editor_reviewed",
  "scheduled",
  "posted",
  "failed",
  "taken_down",
] as const;
type DraftStatus = (typeof KNOWN_STATUSES)[number];

function isStatus(s: string | undefined): s is DraftStatus {
  return !!s && (KNOWN_STATUSES as readonly string[]).includes(s);
}

export default async function DraftsList({
  searchParams,
}: {
  searchParams?: { status?: string };
}) {
  const guard = await requireAdminPage();
  if (guard) return guard;

  if (!process.env.DATABASE_URL) {
    return (
      <div className="container-page py-10 max-w-4xl">
        <div className="card p-8 text-sm text-ink-600">
          <h1 className="font-serif text-xl text-ink-900 mb-2">DATABASE_URL not configured</h1>
          <p>Configure the DB then run <code>npm run db:migrate</code>.</p>
        </div>
      </div>
    );
  }

  const filter = isStatus(searchParams?.status) ? (searchParams!.status as DraftStatus) : null;
  const counts = await draftStateCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const drafts = await db
    .select()
    .from(contentDrafts)
    .where(filter ? eq(contentDrafts.status, filter) : sql`true`)
    .orderBy(desc(contentDrafts.createdAt))
    .limit(50);

  return (
    <div className="container-page py-10 max-w-4xl">
      <header className="mb-6">
        <p className="pill-coral w-fit">Admin · Drafts</p>
        <h1 className="mt-3 font-serif text-3xl text-ink-900">Drafts queue</h1>
        <p className="mt-2 text-ink-600">
          Generate a new script from a brief, then review, render, and publish.
        </p>
      </header>

      <DraftCreateForm />

      <nav className="mt-10 mb-3 flex items-center gap-2 flex-wrap" aria-label="Filter drafts by status">
        <FilterChip href="/admin/drafts" label={`All (${total})`} active={!filter} />
        {KNOWN_STATUSES.map((s) => (
          <FilterChip
            key={s}
            href={`/admin/drafts?status=${s}`}
            label={`${s.replaceAll("_", " ")} (${counts[s] ?? 0})`}
            active={filter === s}
            pillClass={STATUS_PILL[s] ?? "pill"}
          />
        ))}
      </nav>

      <h2 className="font-serif text-xl text-ink-900 mb-3">
        {filter ? `${filter.replaceAll("_", " ")} drafts` : "Recent drafts"}
      </h2>
      {drafts.length === 0 ? (
        <div className="card p-6 text-sm text-ink-600">
          {filter
            ? `No drafts in ${filter.replaceAll("_", " ")}.`
            : "No drafts yet. Use the form above to generate one."}
        </div>
      ) : (
        <ul className="space-y-3">
          {drafts.map((d) => (
            <li key={d.id}>
              <Link href={`/admin/drafts/${d.id}`} className="card card-hover p-4 block">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={STATUS_PILL[d.status] ?? "pill"}>
                    {d.status.replaceAll("_", " ")}
                  </span>
                  <span className="pill">{d.kind}</span>
                  <span className="pill">{d.language}</span>
                  <span className="text-xs text-ink-400 ml-auto">
                    {new Date(d.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink-700 line-clamp-2">{d.brief}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  href,
  label,
  active,
  pillClass,
}: {
  href: string;
  label: string;
  active: boolean;
  pillClass?: string;
}) {
  const base = pillClass ?? "pill";
  return (
    <Link
      href={href}
      className={`${base} ${active ? "ring-2 ring-accent ring-offset-1 ring-offset-bg" : "opacity-80 hover:opacity-100"}`}
    >
      {label}
    </Link>
  );
}
