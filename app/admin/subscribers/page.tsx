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
          The growth chart comes from our own audit log (every subscribe event
          is timestamped server-side with a hashed fingerprint — no email
          stored). The live list is pulled from Buttondown, where the
          source-of-truth address book lives.
        </p>
      </header>

      {/* TOP-LINE COUNTERS */}
      <section className="grid gap-3 sm:grid-cols-3">
        <Counter
          label="Total subscribers"
          value={view.totalCount ?? 0}
          suffix={view.totalCount === null ? "(unavailable)" : undefined}
        />
        <Counter
          label={`New (last ${windowDays}d)`}
          value={view.growthPerDay.reduce(
            (a, b) => a + (Number(b.subscribes) || 0),
            0,
          )}
          accent="teal"
        />
        <div className="card p-4 h-full flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-400">
              Export
            </p>
            <p className="text-sm text-ink-700 mt-1">CSV from Buttondown.</p>
          </div>
          {view.buttondownConfigured ? (
            <a
              href={`/api/admin/subscribers.csv`}
              className="btn-secondary text-sm"
            >
              Download CSV
            </a>
          ) : (
            <span className="text-xs text-ink-400">Set BUTTONDOWN_API_KEY</span>
          )}
        </div>
      </section>

      {/* CONFIG WARNINGS */}
      {!view.configured && (
        <div className="mt-4 card p-4 text-sm text-ink-600 border border-coral/40 bg-coral/5">
          DATABASE_URL is not configured — the growth chart will be empty until
          it is.
        </div>
      )}
      {view.configured && !view.buttondownConfigured && (
        <div className="mt-4 card p-4 text-sm text-ink-600 border border-warn/40 bg-warn/10">
          <strong className="text-ink-900">BUTTONDOWN_API_KEY is not set.</strong>{" "}
          The growth chart still works (it comes from our audit log), but we
          can't show the live subscriber list or total count until Buttondown is
          configured.
        </div>
      )}

      {/* GROWTH CHART */}
      <section className="mt-8 card p-5">
        <h2 className="font-serif text-xl text-ink-900">New signups per day</h2>
        <p className="mt-1 text-sm text-ink-600">
          Last {windowDays} days. From audit log — every subscribe call writes
          one timestamped row.
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
          {view.totalCount !== null && (
            <span className="text-xs text-ink-400">
              of {view.totalCount.toLocaleString()} total
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-ink-400 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-normal px-3 py-2">When</th>
                <th className="text-left font-normal px-3 py-2">Email</th>
                <th className="text-left font-normal px-3 py-2">Tags</th>
              </tr>
            </thead>
            <tbody>
              {view.recent.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-ink-400">
                    No subscribers yet, or Buttondown not reachable.
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
