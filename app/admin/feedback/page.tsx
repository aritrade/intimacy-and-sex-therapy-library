import Link from "next/link";
import { LineChartCard, DonutChartCard } from "@/components/admin/charts/Charts";
import { requireAdminPage } from "@/lib/auth/admin-page-guard";
import { feedbackView } from "@/lib/admin/dashboard-stats";

export const metadata = { title: "User feedback · Admin" };
export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  improvement: "Improvement",
  praise: "Praise",
  bug: "Bug",
  other: "Other",
};

export default async function AdminFeedback({
  searchParams,
}: {
  searchParams: { category?: string; days?: string };
}) {
  const guard = await requireAdminPage();
  if (guard) return guard;

  const windowDays = Number(searchParams.days) || 30;
  const view = await feedbackView({
    windowDays,
    limit: 200,
    category: searchParams.category,
  });

  const donutData = view.byCategory.map((c) => ({
    name: CATEGORY_LABEL[c.category] ?? c.category,
    value: c.n,
  }));

  return (
    <div className="container-page py-10 max-w-6xl">
      <header className="mb-6">
        <p className="pill-coral w-fit">Admin · Feedback</p>
        <h1 className="mt-3 font-serif text-3xl text-ink-900">User feedback</h1>
        <p className="mt-2 text-ink-600">
          Everything submitted via the public homepage feedback form. We store
          the email + message as plaintext — users opted in by submitting.
        </p>
      </header>

      {!view.configured && (
        <div className="card p-4 text-sm text-ink-600 border border-coral/40 bg-coral/5">
          DATABASE_URL is not configured. Numbers will populate once it is.
        </div>
      )}

      {/* TOP-LINE COUNTERS */}
      <section className="grid gap-3 sm:grid-cols-3">
        <Counter label="Total all-time" value={view.total} />
        <Counter label={`Last ${windowDays}d`} value={view.totalWindow} accent="teal" />
        <div className="card p-4 h-full flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-400">
              Export
            </p>
            <p className="text-sm text-ink-700 mt-1">CSV of every submission.</p>
          </div>
          <a
            href={`/api/admin/feedback.csv?days=${windowDays}${searchParams.category ? `&category=${searchParams.category}` : ""}`}
            className="btn-secondary text-sm"
          >
            Download CSV
          </a>
        </div>
      </section>

      {/* CHARTS */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-serif text-xl text-ink-900">Submissions per day</h2>
          <p className="mt-1 text-sm text-ink-600">
            Last {windowDays} days. Submissions cluster around new releases —
            useful to gauge the impact of campaign pushes.
          </p>
          <div className="mt-4">
            <LineChartCard
              data={view.perDay}
              series={[{ key: "submissions", label: "Submissions" }]}
              height={220}
            />
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-serif text-xl text-ink-900">By category</h2>
          <p className="mt-1 text-sm text-ink-600">
            Window: last {windowDays} days. Click a slice to filter the list
            below.
          </p>
          <div className="mt-4">
            {donutData.length === 0 ? (
              <p className="text-sm text-ink-400">No submissions in window.</p>
            ) : (
              <DonutChartCard data={donutData} height={240} centerLabel="submissions" />
            )}
          </div>
        </div>
      </section>

      {/* FILTERS */}
      <section className="mt-8 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink-400">Filter:</span>
        <FilterLink href={`?days=${windowDays}`} active={!searchParams.category}>
          All
        </FilterLink>
        {(["improvement", "praise", "bug", "other"] as const).map((c) => (
          <FilterLink
            key={c}
            href={`?days=${windowDays}&category=${c}`}
            active={searchParams.category === c}
          >
            {CATEGORY_LABEL[c]}
          </FilterLink>
        ))}
        <span className="text-ink-400 ml-3">Window:</span>
        {[7, 30, 90, 365].map((d) => (
          <FilterLink
            key={d}
            href={`?days=${d}${searchParams.category ? `&category=${searchParams.category}` : ""}`}
            active={windowDays === d}
          >
            {d}d
          </FilterLink>
        ))}
      </section>

      {/* TABLE */}
      <section className="mt-4 card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-ink-400 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-normal px-3 py-2">When</th>
                <th className="text-left font-normal px-3 py-2">Email</th>
                <th className="text-left font-normal px-3 py-2">Category</th>
                <th className="text-left font-normal px-3 py-2">Locale</th>
                <th className="text-left font-normal px-3 py-2">Source</th>
                <th className="text-left font-normal px-3 py-2">Message</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-ink-400">
                    No feedback yet.
                  </td>
                </tr>
              ) : (
                view.rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 text-ink-400 whitespace-nowrap font-mono text-xs">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-ink-900 font-mono text-xs">
                      <a href={`mailto:${r.email}`} className="underline">
                        {r.email}
                      </a>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`pill text-xs ${r.category === "praise" ? "pill-teal" : r.category === "bug" ? "pill-coral" : r.category === "improvement" ? "pill-plum" : ""}`}>
                        {CATEGORY_LABEL[r.category]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink-700 text-xs">{r.locale ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-700 text-xs">
                      {r.sourcePath ? <code>{r.sourcePath}</code> : "—"}
                    </td>
                    <td className="px-3 py-2 text-ink-700 max-w-xl">
                      <p className="whitespace-pre-wrap">{r.message}</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-4 text-xs text-ink-400">
        Showing the most recent {view.rows.length} submission
        {view.rows.length === 1 ? "" : "s"}.{" "}
        <Link href="/admin" className="underline">
          Back to admin home
        </Link>
        .
      </p>
    </div>
  );
}

function Counter({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "coral" | "plum" | "teal";
}) {
  const pillClass =
    accent === "coral"
      ? "pill-coral"
      : accent === "plum"
        ? "pill-plum"
        : accent === "teal"
          ? "pill-teal"
          : "pill";
  return (
    <div className="card p-4 h-full">
      <span className={pillClass}>{label}</span>
      <p className="mt-2 font-serif text-3xl text-ink-900 tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`pill text-xs ${active ? "bg-accent text-white" : "hover:bg-surface"}`}
    >
      {children}
    </Link>
  );
}
