import Link from "next/link";
import { AreaChartCard } from "@/components/admin/charts/Charts";
import { requireAdminAreaPage } from "@/lib/auth/admin-page-guard";
import { subscriberView } from "@/lib/admin/dashboard-stats";

export const metadata = { title: "Subscribers · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminSubscribers({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  const guard = await requireAdminAreaPage();
  if (guard) return guard;

  const windowDays = Number(searchParams.days) || 90;
  const view = await subscriberView(windowDays);

  return (
    <div className="container-page py-10 max-w-6xl">
      <header className="mb-6">
        <p className="pill-coral w-fit">Admin · Subscribers</p>
        <h1 className="mt-3 font-serif text-3xl text-ink-900">Newsletter subscribers</h1>
        <p className="mt-2 text-ink-600">
          We own this list in our own database (double opt-in). The chart counts
          confirmations per day; the table below is the live, owned address book.
          Delivery is handled by Amazon SES, and every email carries a one-click
          unsubscribe.
        </p>
      </header>

      {/* TOP-LINE COUNTERS */}
      <section className="grid gap-3 sm:grid-cols-4">
        <Counter label="Confirmed" value={view.totalCount} accent="teal" />
        <Counter label="Pending" value={view.pendingCount} accent="plum" />
        <Counter label="Unsubscribed" value={view.unsubscribedCount} accent="coral" />
        <div className="card p-4 h-full flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-400">
              Export
            </p>
            <p className="text-sm text-ink-700 mt-1">Confirmed list as CSV.</p>
          </div>
          {view.configured ? (
            <a
              href={`/api/admin/subscribers.csv`}
              className="btn-secondary text-sm"
            >
              Download CSV
            </a>
          ) : (
            <span className="text-xs text-ink-400">Set DATABASE_URL</span>
          )}
        </div>
      </section>

      {/* CONFIG WARNINGS */}
      {!view.configured && (
        <div className="mt-4 card p-4 text-sm text-ink-600 border border-coral/40 bg-coral/5">
          DATABASE_URL is not configured — the subscriber list and growth chart
          will be empty until it is.
        </div>
      )}

      {/* GROWTH CHART */}
      <section className="mt-8 card p-5">
        <h2 className="font-serif text-xl text-ink-900">New confirmations per day</h2>
        <p className="mt-1 text-sm text-ink-600">
          Last {windowDays} days. Counts subscribers who completed double opt-in
          on that day.
        </p>
        <div className="mt-4">
          <AreaChartCard
            data={view.growthPerDay}
            series={[{ key: "subscribes", label: "New signups" }]}
            height={220}
          />
        </div>
        <div className="mt-3 flex gap-2 text-xs">
          {[30, 90, 365].map((d) => (
            <Link
              key={d}
              href={`?days=${d}`}
              className={`pill ${windowDays === d ? "bg-accent text-white" : "hover:bg-surface"}`}
            >
              {d}d
            </Link>
          ))}
        </div>
      </section>

      {/* LIST */}
      <section className="mt-8 card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-serif text-xl text-ink-900">
            Recent subscribers ({view.recent.length})
          </h2>
          <span className="text-xs text-ink-400">
            {view.totalCount.toLocaleString()} confirmed
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-ink-400 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-normal px-3 py-2">When</th>
                <th className="text-left font-normal px-3 py-2">Email</th>
                <th className="text-left font-normal px-3 py-2">Status</th>
                <th className="text-left font-normal px-3 py-2">Tags</th>
              </tr>
            </thead>
            <tbody>
              {view.recent.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-ink-400">
                    No subscribers yet.
                  </td>
                </tr>
              ) : (
                view.recent.map((s) => (
                  <tr key={s.email} className="border-t border-border">
                    <td className="px-3 py-2 text-ink-400 whitespace-nowrap font-mono text-xs">
                      {s.createdAt.getTime() > 0
                        ? new Date(s.createdAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-ink-900 font-mono text-xs">
                      <a href={`mailto:${s.email}`} className="underline">
                        {s.email}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <StatusPill status={s.status} />
                    </td>
                    <td className="px-3 py-2 text-ink-700 text-xs">
                      {s.tags.length === 0 ? (
                        <span className="text-ink-400">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {s.tags.map((t) => (
                            <span key={t} className="pill text-[10px]">
                              {t}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-4 text-xs text-ink-400">
        <Link href="/admin" className="underline">
          Back to admin home
        </Link>
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "confirmed"
      ? "pill-teal"
      : status === "pending"
        ? "pill-plum"
        : "pill-coral";
  return <span className={`${cls} text-[10px]`}>{status}</span>;
}

function Counter({
  label,
  value,
  accent,
  suffix,
}: {
  label: string;
  value: number;
  accent?: "coral" | "plum" | "teal";
  suffix?: string;
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
      {suffix && <p className="mt-0.5 text-xs text-ink-400">{suffix}</p>}
    </div>
  );
}
