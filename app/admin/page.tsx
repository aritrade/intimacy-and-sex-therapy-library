import Link from "next/link";
import {
  actionableDrafts,
  activeTakedowns,
  crisisCounts,
  draftStateCounts,
  evalTrend,
  recentAudit,
  recentPosts,
  resourceStats,
} from "@/lib/admin/stats";
import { requireAdminPage } from "@/lib/auth/admin-page-guard";
import { PollNowButton } from "@/components/admin/PollNowButton";

export const metadata = { title: "Admin · Intimacy & Sex Therapy Library" };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const guard = await requireAdminPage();
  if (guard) return guard;

  // Run the dashboard queries in parallel; each fails closed independently
  // so a partial outage never blanks the whole page.
  const [drafts, queue, resourcesStats, crisis, evals, audit, posts, takedowns] = await Promise.all(
    [
      draftStateCounts(),
      actionableDrafts(),
      resourceStats(),
      crisisCounts(7),
      evalTrend(5),
      recentAudit(12),
      recentPosts({ windowDays: 30, limit: 6 }),
      activeTakedowns({ windowDays: 60, limit: 5 }),
    ],
  );

  const dbConfigured = !!process.env.DATABASE_URL;
  const totalDrafts = Object.values(drafts).reduce((a, b) => a + b, 0);

  return (
    <div className="container-page py-10 max-w-5xl">
      <header className="mb-6">
        <p className="pill-coral w-fit">Admin</p>
        <h1 className="mt-3 font-serif text-3xl text-ink-900">Reviewer console</h1>
        <p className="mt-2 text-ink-600">
          What needs your attention right now. Counts refresh every page load.
        </p>
        {!dbConfigured && (
          <div className="mt-4 card p-4 text-sm text-ink-600 border border-coral/40 bg-coral/5">
            <strong className="text-ink-900">DATABASE_URL is not configured.</strong>{" "}
            Metrics below will be zero until the DB is wired and migrations have
            been applied.
          </div>
        )}

        {takedowns.length > 0 && (
          <div
            role="alert"
            className="mt-4 card p-4 text-sm border border-coral/50 bg-coral/10"
          >
            <div className="flex items-center gap-2">
              <span className="pill-coral">Takedown alert</span>
              <span className="text-ink-900 font-medium">
                {takedowns.length} post{takedowns.length === 1 ? "" : "s"} taken down
              </span>
            </div>
            <ul className="mt-3 space-y-1.5 text-xs">
              {takedowns.map((t) => (
                <li key={t.draftId} className="flex flex-wrap items-center gap-2">
                  <span className="pill">{t.platform}</span>
                  <Link
                    href={`/admin/drafts/${t.draftId}`}
                    className="text-ink-900 underline truncate max-w-md"
                  >
                    {t.brief.slice(0, 80)}
                  </Link>
                  <span className="text-ink-400 font-mono ml-auto">
                    {new Date(t.detectedAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-600">
              Takedowns are detected by the post-metrics poller. Review the draft and
              decide whether to revise + repost, or accept the platform's signal.
            </p>
          </div>
        )}
      </header>

      <section aria-label="Top-line counters" className="grid gap-3 sm:grid-cols-4">
        <Counter label="Drafts (all)" value={totalDrafts} href="/admin/drafts" />
        <Counter
          label="Awaiting clinician"
          value={queue.awaitingClinician.length}
          accent="coral"
          href="/admin/drafts?status=script_draft"
        />
        <Counter
          label="Awaiting editor"
          value={queue.awaitingEditor.length}
          accent="plum"
          href="/admin/drafts?status=clinician_reviewed"
        />
        <Counter
          label="Ready to publish"
          value={queue.readyToPublish.length}
          accent="teal"
          href="/admin/drafts?status=editor_reviewed"
        />
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <DraftQueueCard
          title="Awaiting clinician"
          slices={queue.awaitingClinician}
          empty="Nothing waiting on a clinician — nice."
        />
        <DraftQueueCard
          title="Awaiting editor"
          slices={queue.awaitingEditor}
          empty="No drafts waiting on editorial sign-off."
        />
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-serif text-xl text-ink-900">
            Crisis events · last {crisis.windowDays} days
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Content-free counts, fingerprints hashed. We use these to monitor
            traffic patterns; we never read the underlying messages.
          </p>
          <div className="mt-4 flex gap-3 text-sm">
            <span className="pill-teal">chat · {crisis.bySurface.chat}</span>
            <span className="pill-plum">companion · {crisis.bySurface.companion}</span>
            <span className="ml-auto text-ink-400">total {crisis.total}</span>
          </div>
          {crisis.byCategory.length > 0 ? (
            <ul className="mt-4 space-y-1 text-sm">
              {crisis.byCategory.map((c) => (
                <li key={c.category} className="flex justify-between">
                  <span className="text-ink-700">{c.category.replaceAll("_", " ")}</span>
                  <span className="font-mono text-ink-400">{c.n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink-400">No events in this window.</p>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-serif text-xl text-ink-900">Catalog health</h2>
          <p className="mt-1 text-sm text-ink-600">
            Resources never auto-publish. Unpublished items are awaiting curator
            review in <Link href="/admin/drafts" className="underline">drafts</Link>.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Stat label="Published" value={resourcesStats.published} />
            <Stat label="Unpublished" value={resourcesStats.unpublished} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
            <MiniBreakdown title="By license" rows={resourcesStats.byLicense.map((r) => ({ k: r.license, v: r.n }))} />
            <MiniBreakdown title="By kind" rows={resourcesStats.byKind.map((r) => ({ k: r.kind, v: r.n }))} />
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-serif text-xl text-ink-900">Recent posts (30 days)</h2>
          <PollNowButton />
        </div>
        {posts.length === 0 ? (
          <div className="card p-6 text-sm text-ink-600">
            No posts in this window. Drafts only land here after both clinician
            and editor approval AND a human clicking publish.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {posts.map((p) => (
              <li key={p.draftId}>
                <Link href={`/admin/drafts/${p.draftId}`} className="card card-hover p-4 block">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={
                        p.status === "taken_down" ? "pill-coral" : "pill-teal"
                      }
                    >
                      {p.status.replaceAll("_", " ")}
                    </span>
                    {p.platforms.map((pl) => (
                      <span key={pl} className="pill">
                        {pl}
                      </span>
                    ))}
                    <span className="ml-auto text-xs text-ink-400">
                      {new Date(p.postedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-ink-700 line-clamp-2">{p.brief}</p>
                  <dl className="mt-3 grid grid-cols-4 gap-2 text-xs">
                    <Metric label="views" value={p.totals.views} />
                    <Metric label="likes" value={p.totals.likes} />
                    <Metric label="comments" value={p.totals.comments} />
                    <Metric label="saves" value={p.totals.saves} />
                  </dl>
                  {p.perPlatform.every((pp) => pp.pulledAt === null) && (
                    <p className="mt-2 text-xs text-ink-400">
                      No metrics pulled yet — run the poller.
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-serif text-xl text-ink-900">Eval trend (latest 5)</h2>
          <p className="mt-1 text-sm text-ink-600">
            Adversarial eval harness. <code>refusal</code> = correct refusal rate;{" "}
            <code>citation</code> = citation faithfulness; <code>empathy</code> = 0–5.
          </p>
          {evals.length === 0 ? (
            <p className="mt-4 text-sm text-ink-400">No runs yet. Run <code>npm run eval</code>.</p>
          ) : (
            <table className="mt-4 w-full text-xs font-mono">
              <thead className="text-ink-400">
                <tr>
                  <th className="text-left font-normal">when</th>
                  <th className="text-right font-normal">refusal</th>
                  <th className="text-right font-normal">citation</th>
                  <th className="text-right font-normal">empathy</th>
                </tr>
              </thead>
              <tbody>
                {evals.map((e, i) => (
                  <tr key={i}>
                    <td className="text-ink-700">{new Date(e.ranAt).toLocaleDateString()}</td>
                    <td className="text-right">{e.refusalRate.toFixed(3)}</td>
                    <td className="text-right">{e.citationFaithfulness.toFixed(3)}</td>
                    <td className="text-right">{e.empathy.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-serif text-xl text-ink-900">Recent admin actions</h2>
          <p className="mt-1 text-sm text-ink-600">
            Audit trail of consequential actions. Actor IDs are hashed; bodies are
            scrubbed. Useful for "did anything publish in the last hour?".
          </p>
          {audit.length === 0 ? (
            <p className="mt-4 text-sm text-ink-400">Nothing yet.</p>
          ) : (
            <ul className="mt-4 space-y-1 text-xs font-mono">
              {audit.map((a, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate text-ink-700">{a.action}</span>
                  <span className="shrink-0 text-ink-400">
                    {new Date(a.ts).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-xl text-ink-900 mb-3">Quick links</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/admin/queue" className="card card-hover p-5 block">
            <h3 className="font-serif text-base text-ink-900">Today&apos;s queue</h3>
            <p className="mt-2 text-sm text-ink-600">
              Single-tap clinician → editor → publish lanes.
            </p>
          </Link>
          <Link href="/admin/drafts" className="card card-hover p-5 block">
            <h3 className="font-serif text-base text-ink-900">All drafts</h3>
            <p className="mt-2 text-sm text-ink-600">
              Generate, review, and publish short-form drafts.
            </p>
          </Link>
          <Link href="/admin/analytics" className="card card-hover p-5 block">
            <h3 className="font-serif text-base text-ink-900">Analytics</h3>
            <p className="mt-2 text-sm text-ink-600">
              Engagement, follower growth, top posts, and a link to Vercel
              visitor + country analytics.
            </p>
          </Link>
          <Link href="/admin/feedback" className="card card-hover p-5 block">
            <h3 className="font-serif text-base text-ink-900">User feedback</h3>
            <p className="mt-2 text-sm text-ink-600">
              Public homepage submissions — charts, filters, CSV export.
            </p>
          </Link>
          <Link href="/admin/subscribers" className="card card-hover p-5 block">
            <h3 className="font-serif text-base text-ink-900">Subscribers</h3>
            <p className="mt-2 text-sm text-ink-600">
              Owned newsletter list — confirmations chart, live list, CSV export.
            </p>
          </Link>
          <Link href="/admin/proposals" className="card card-hover p-5 block">
            <h3 className="font-serif text-base text-ink-900">Sync proposals</h3>
            <p className="mt-2 text-sm text-ink-600">
              Approve link-fix, freshness, and discovery suggestions.
            </p>
          </Link>
          <Link href="/admin/users" className="card card-hover p-5 block">
            <h3 className="font-serif text-base text-ink-900">Users &amp; roles</h3>
            <p className="mt-2 text-sm text-ink-600">
              Promote clinicians, editors, and admins.
            </p>
          </Link>
          <Link href="/about/model" className="card card-hover p-5 block">
            <h3 className="font-serif text-base text-ink-900">Model card</h3>
            <p className="mt-2 text-sm text-ink-600">
              How the AI works and how we measure it.
            </p>
          </Link>
          <Link href="/status" className="card card-hover p-5 block">
            <h3 className="font-serif text-base text-ink-900">Operations status</h3>
            <p className="mt-2 text-sm text-ink-600">
              Public health of DB, KMS, and AI providers.
            </p>
          </Link>
        </ul>
      </section>

      <section className="mt-10 card p-5 text-sm text-ink-600">
        <h2 className="font-serif text-xl text-ink-900 mb-2">Publishing reality check</h2>
        <p>
          Sex-health content is treated harshly by Instagram and YouTube. Reach is
          reduced unpredictably; takedowns happen even for clinically accurate
          content.{" "}
          <strong className="text-ink-900">
            We never auto-post and we never schedule a post.
          </strong>{" "}
          Every publication requires (1) clinician approval, (2) editor approval,
          and (3) a human clicking publish on this admin page.
        </p>
      </section>
    </div>
  );
}

function Counter({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number;
  href?: string;
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
  const inner = (
    <div className="card p-4 h-full">
      <div className="flex items-center gap-2">
        <span className={pillClass}>{label}</span>
      </div>
      <p className="mt-2 font-serif text-3xl text-ink-900 tabular-nums">{value}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-90 transition-opacity">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-[11px] uppercase tracking-wider text-ink-400">{label}</p>
      <p className="mt-1 font-serif text-2xl text-ink-900 tabular-nums">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-ink-400">{label}</dt>
      <dd className="font-mono text-ink-900 tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}

function MiniBreakdown({ title, rows }: { title: string; rows: Array<{ k: string; v: number }> }) {
  return (
    <div>
      <p className="uppercase tracking-wider text-ink-400 text-[10px]">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-1 text-ink-400">—</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {rows.slice(0, 6).map((r) => (
            <li key={r.k} className="flex justify-between gap-2">
              <span className="truncate text-ink-700">{r.k}</span>
              <span className="text-ink-400 tabular-nums">{r.v}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DraftQueueCard({
  title,
  slices,
  empty,
}: {
  title: string;
  slices: Array<{ id: string; brief: string; language: string; kind: string; status: string; createdAt: Date }>;
  empty: string;
}) {
  return (
    <div className="card p-5">
      <h2 className="font-serif text-xl text-ink-900">{title}</h2>
      {slices.length === 0 ? (
        <p className="mt-3 text-sm text-ink-400">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {slices.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/drafts/${s.id}`} className="block rounded-xl border border-border bg-surface p-3 hover:border-accent/60">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="pill">{s.kind}</span>
                  <span className="pill">{s.language}</span>
                  <span className="ml-auto text-ink-400">
                    {new Date(s.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink-700 line-clamp-2">{s.brief}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
