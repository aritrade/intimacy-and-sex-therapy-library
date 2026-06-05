import Link from "next/link";
import {
  AreaChartCard,
  BarChartCard,
  Sparkline,
} from "@/components/admin/charts/Charts";
import { requireAdminAreaPage } from "@/lib/auth/admin-page-guard";
import {
  channelSnapshotView,
  engagementSnapshot,
  trafficView,
} from "@/lib/admin/dashboard-stats";

export const metadata = { title: "Analytics · Admin" };
export const dynamic = "force-dynamic";

const PLATFORM_LABEL: Record<string, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
};

export default async function AdminAnalytics() {
  const guard = await requireAdminAreaPage();
  if (guard) return guard;

  const [engagement, channels, traffic] = await Promise.all([
    engagementSnapshot(30),
    channelSnapshotView(90),
    trafficView(30),
  ]);

  const countryBarData = traffic.topCountries.map((c) => ({
    x: c.country.toUpperCase(),
    Visits: c.n,
  }));

  const vercelProject = process.env.VERCEL_PROJECT_NAME || "intimacy-and-sex-therapy-library";

  // Map per-platform engagement to a chartable shape.
  const platformBarData = engagement.perPlatform.map((p) => ({
    x: PLATFORM_LABEL[p.platform] ?? p.platform,
    Views: p.views,
    Likes: p.likes,
    Comments: p.comments,
  }));

  // Daily views chart — keys map to platform names actually present.
  const platformsInDaily = Array.from(
    new Set(
      engagement.daily.flatMap((d) =>
        Object.keys(d).filter((k) => k !== "x"),
      ),
    ),
  );

  return (
    <div className="container-page py-10 max-w-6xl">
      <header className="mb-6">
        <p className="pill-coral w-fit">Admin · Analytics</p>
        <h1 className="mt-3 font-serif text-3xl text-ink-900">Engagement & growth</h1>
        <p className="mt-2 text-ink-600">
          What's resonating on YouTube, Instagram and Facebook over the last 30
          days. Channel followers go back 90 days. Visitor counts &amp; country
          breakdown live in the Vercel dashboard linked below.
        </p>
        <p className="mt-2 text-xs text-ink-400">
          Run the channel poller weekly (or hit Refresh on the home page) to keep
          these numbers fresh.
        </p>
      </header>

      {/* TOP-LINE COUNTERS */}
      <section className="grid gap-3 sm:grid-cols-4">
        <Counter label="Views" value={engagement.totals.views} />
        <Counter label="Likes" value={engagement.totals.likes} accent="coral" />
        <Counter label="Comments" value={engagement.totals.comments} accent="plum" />
        <Counter label="Saves" value={engagement.totals.saves} accent="teal" />
      </section>

      {/* CHANNEL FOLLOWERS */}
      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {channels.latest.length === 0 ? (
          <div className="card p-5 sm:col-span-3 text-sm text-ink-600">
            No channel snapshots yet. Configure <code>YOUTUBE_CHANNEL_ID</code> /{" "}
            <code>INSTAGRAM_BUSINESS_ACCOUNT_ID</code> /{" "}
            <code>FACEBOOK_PAGE_ID</code> and run the channel poller (or wait for
            the weekly cron) to populate this section.
          </div>
        ) : (
          channels.latest.map((c) => (
            <div key={c.platform} className="card p-5">
              <p className="text-[11px] uppercase tracking-wider text-ink-400">
                {PLATFORM_LABEL[c.platform] ?? c.platform}
              </p>
              <p className="mt-2 font-serif text-3xl text-ink-900 tabular-nums">
                {c.followers.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-ink-600">followers · {c.handle ?? "—"}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <Tile label="Posts" value={c.posts} />
                <Tile label="Lifetime views" value={c.totalViews} />
              </div>
            </div>
          ))
        )}
      </section>

      {/* DAILY VIEWS LINE CHART */}
      {platformsInDaily.length > 0 && (
        <section className="mt-8 card p-5">
          <h2 className="font-serif text-xl text-ink-900">Views per day (last {engagement.windowDays}d)</h2>
          <p className="mt-1 text-sm text-ink-600">
            Sum of latest pulled views per platform per day. Bars on a flat day
            mean we polled but the platform didn't surface any new views.
          </p>
          <div className="mt-4">
            <AreaChartCard
              data={engagement.daily}
              series={platformsInDaily.map((p) => ({
                key: p,
                label: PLATFORM_LABEL[p] ?? p,
              }))}
              height={260}
            />
          </div>
        </section>
      )}

      {/* PER-PLATFORM BREAKDOWN */}
      {platformBarData.length > 0 && (
        <section className="mt-8 card p-5">
          <h2 className="font-serif text-xl text-ink-900">By platform (latest)</h2>
          <p className="mt-1 text-sm text-ink-600">
            Sum of the most recent metric pull per post per platform across the
            last {engagement.windowDays} days.
          </p>
          <div className="mt-4">
            <BarChartCard
              data={platformBarData}
              series={[
                { key: "Views", label: "Views" },
                { key: "Likes", label: "Likes" },
                { key: "Comments", label: "Comments" },
              ]}
              height={240}
            />
          </div>
        </section>
      )}

      {/* CHANNEL FOLLOWERS OVER TIME */}
      {channels.followersOverTime.some((p) =>
        Object.keys(p).some((k) => k !== "x"),
      ) && (
        <section className="mt-8 card p-5">
          <h2 className="font-serif text-xl text-ink-900">Followers over time (90d)</h2>
          <p className="mt-1 text-sm text-ink-600">
            Daily snapshot of follower / subscriber count per platform. Flat
            lines indicate no fresh poll that day.
          </p>
          <div className="mt-4">
            <AreaChartCard
              data={channels.followersOverTime}
              series={["youtube", "instagram", "facebook"]
                .filter((p) =>
                  channels.followersOverTime.some((point) => point[p] !== undefined),
                )
                .map((p) => ({ key: p, label: PLATFORM_LABEL[p] ?? p }))}
              height={240}
            />
          </div>
        </section>
      )}

      {/* TOP POSTS */}
      <section className="mt-8 card p-5">
        <h2 className="font-serif text-xl text-ink-900">Top posts ({engagement.windowDays}d)</h2>
        <p className="mt-1 text-sm text-ink-600">
          Ranked by total views across all platforms. Sparkline shows views per
          day over the last 7 polls for that post.
        </p>
        {engagement.topPosts.length === 0 ? (
          <p className="mt-4 text-sm text-ink-400">
            Nothing posted in the last {engagement.windowDays} days — or the
            metrics poller hasn't run yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {engagement.topPosts.map((p) => (
              <li key={p.draftId} className="py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/admin/drafts/${p.draftId}`}
                    className="text-sm text-ink-900 underline truncate max-w-md"
                  >
                    {p.brief}
                  </Link>
                  {p.platforms.map((pl) => (
                    <span key={pl} className="pill text-xs">
                      {pl}
                    </span>
                  ))}
                  <span className="ml-auto text-xs text-ink-400">
                    {new Date(p.postedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-3 text-xs items-center">
                  <Tile label="Views" value={p.views} />
                  <Tile label="Likes" value={p.likes} />
                  <Tile label="Comments" value={p.comments} />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">
                      Views trend
                    </p>
                    <Sparkline values={p.sparkline} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* IN-APP SITE TRAFFIC (page_views) */}
      <section className="mt-10">
        <header className="mb-4">
          <h2 className="font-serif text-2xl text-ink-900">Site traffic (in-app)</h2>
          <p className="mt-1 text-sm text-ink-600">
            First-party page views from the last {traffic.windowDays} days, logged
            by <code>/api/track</code> using Vercel edge geo headers. No IP, no
            cookies, no PII — bots excluded.
          </p>
        </header>

        {traffic.totalVisits === 0 ? (
          <div className="card p-5 text-sm text-ink-600">
            No visits logged yet. Data appears here once real (non-bot) traffic
            hits the site after this deploy.
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Counter label="Visits" value={traffic.totalVisits} />
              {traffic.devices.slice(0, 3).map((d, i) => (
                <Counter
                  key={d.device}
                  label={d.device}
                  value={d.n}
                  accent={(["teal", "plum", "coral"] as const)[i]}
                />
              ))}
            </div>

            <div className="mt-4 card p-5">
              <h3 className="font-serif text-lg text-ink-900">Visits per day</h3>
              <div className="mt-4">
                <AreaChartCard
                  data={traffic.perDay}
                  series={[{ key: "visits", label: "Visits" }]}
                  height={220}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="card p-5">
                <h3 className="font-serif text-lg text-ink-900">Top countries</h3>
                {countryBarData.length > 0 ? (
                  <div className="mt-4">
                    <BarChartCard
                      data={countryBarData}
                      series={[{ key: "Visits", label: "Visits" }]}
                      height={240}
                    />
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-ink-400">No country data yet.</p>
                )}
              </div>

              <div className="card p-5">
                <h3 className="font-serif text-lg text-ink-900">Top pages</h3>
                <RankTable
                  rows={traffic.topPages.map((p) => ({ label: p.path, n: p.n }))}
                  emptyLabel="No page data yet."
                />
              </div>
            </div>

            <div className="mt-4 card p-5">
              <h3 className="font-serif text-lg text-ink-900">Top referrers</h3>
              <RankTable
                rows={traffic.topReferrers.map((r) => ({ label: r.host, n: r.n }))}
                emptyLabel="No external referrers yet (direct/in-app traffic only)."
              />
            </div>
          </>
        )}
      </section>

      {/* VERCEL ANALYTICS LINK CARD */}
      <section className="mt-8 card p-5 border border-accent/30 bg-accent/5">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1">
            <h2 className="font-serif text-xl text-ink-900">Site visitors & countries</h2>
            <p className="mt-1 text-sm text-ink-600">
              Visitor counts, country breakdown, device split, and referrer data
              are tracked automatically by Vercel Web Analytics. Free tier — no
              cookies, no PII. Open the Vercel dashboard to see them.
            </p>
          </div>
          <a
            href={`https://vercel.com/${vercelProject}/analytics`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-sm shrink-0"
          >
            Open Vercel Analytics →
          </a>
        </div>
      </section>
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

function RankTable({
  rows,
  emptyLabel,
}: {
  rows: Array<{ label: string; n: number }>;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="mt-3 text-sm text-ink-400">{emptyLabel}</p>;
  }
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <ul className="mt-3 space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3 text-sm">
          <span className="truncate text-ink-700 flex-1" title={r.label}>
            {r.label}
          </span>
          <span className="relative h-2 w-24 rounded-full bg-border/60 overflow-hidden" aria-hidden>
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-accent"
              style={{ width: `${Math.round((r.n / max) * 100)}%` }}
            />
          </span>
          <span className="w-12 text-right tabular-nums text-ink-900">
            {r.n.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-2">
      <p className="text-[10px] uppercase tracking-wider text-ink-400">{label}</p>
      <p className="mt-0.5 font-mono text-ink-900 tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
