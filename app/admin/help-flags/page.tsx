import Link from "next/link";
import { sql, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { helpResultFlags } from "@/lib/db/schema";
import { requireAdminAreaPage } from "@/lib/auth/admin-page-guard";
import { HelpFlagRow } from "@/components/admin/HelpFlagRow";

export const metadata = { title: "Help reports · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminHelpFlags() {
  const guard = await requireAdminAreaPage();
  if (guard) return guard;

  const configured = !!process.env.DATABASE_URL;
  const rows = configured
    ? await db
        .select({
          ref: helpResultFlags.resultRef,
          reports: sql<number>`count(*)::int`,
          hidden: sql<boolean>`bool_or(${helpResultFlags.hidden})`,
          lastAt: sql<Date>`max(${helpResultFlags.createdAt})`,
        })
        .from(helpResultFlags)
        .groupBy(helpResultFlags.resultRef)
        .orderBy(desc(sql`max(${helpResultFlags.createdAt})`))
        .limit(200)
    : [];

  return (
    <div className="container-page py-10 max-w-4xl">
      <header className="mb-6">
        <p className="pill-coral w-fit">Admin · Find help</p>
        <h1 className="mt-3 font-serif text-3xl text-ink-900">Reported results</h1>
        <p className="mt-2 text-ink-600">
          User-reported aggregated results from the Find help hub. Hiding a result suppresses it
          globally from cached search responses. References are place IDs (Google Maps) or hashed
          URLs.
        </p>
      </header>

      {!configured && (
        <div className="card p-4 text-sm text-ink-600 border border-coral/40 bg-coral/5">
          DATABASE_URL is not configured — no reports to show.
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="font-serif text-xl text-ink-900">Reports ({rows.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-ink-400 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-normal px-3 py-2">Result ref</th>
                <th className="text-left font-normal px-3 py-2">Reports</th>
                <th className="text-left font-normal px-3 py-2">Last</th>
                <th className="text-left font-normal px-3 py-2">Status</th>
                <th className="text-right font-normal px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-ink-400">
                    No reports yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <HelpFlagRow
                    key={r.ref}
                    refId={r.ref}
                    reports={r.reports}
                    hidden={r.hidden}
                    lastAt={r.lastAt ? new Date(r.lastAt).toLocaleString() : "—"}
                  />
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
