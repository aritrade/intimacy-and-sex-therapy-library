/**
 * Single-tap admin queue.
 *
 * Lays out every draft that needs human attention in three columns:
 *   1. Awaiting clinician review  (status = "script_draft")
 *   2. Awaiting editor review     (status in {"clinician_reviewed", "rendered"})
 *   3. Awaiting publish           (status = "editor_reviewed")
 *
 * Each card has the *one* primary action that moves it forward — that's
 * the "single-tap" promise. Bulk actions (approve all, publish next 5)
 * are deliberately omitted; the whole point of the queue is that an
 * operator looks at the script first.
 *
 * Renders server-side; the cards themselves are client components so
 * each can fire its action independently without a page reload.
 */

import Link from "next/link";
import { desc, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts } from "@/lib/db/schema";
import { requireAdminPage } from "@/lib/auth/admin-page-guard";
import { QueueActionCard } from "@/components/admin/QueueActionCard";

export const metadata = { title: "Queue · Admin" };
export const dynamic = "force-dynamic";

type LaneKey = "clinician" | "editor" | "publish";

const LANES: Record<LaneKey, { title: string; tagline: string; statuses: string[] }> = {
  clinician: {
    title: "Awaiting clinician review",
    tagline: "Read the script. Approve, request changes, or refuse.",
    statuses: ["script_draft"],
  },
  editor: {
    title: "Awaiting editor review",
    tagline: "Watch the rendered video. Approve copy + caption.",
    statuses: ["clinician_reviewed", "rendered"],
  },
  publish: {
    title: "Awaiting publish",
    tagline: "All sign-offs in. Tap to push to IG + YouTube.",
    statuses: ["editor_reviewed"],
  },
};

export default async function QueuePage() {
  const guard = await requireAdminPage();
  if (guard) return guard;

  if (!process.env.DATABASE_URL) {
    return (
      <div className="container-page py-10 max-w-6xl">
        <div className="card p-8 text-sm text-ink-600">
          <h1 className="font-serif text-xl text-ink-900 mb-2">DATABASE_URL not configured</h1>
          <p>
            Configure the DB then run <code>npm run db:migrate</code>.
          </p>
        </div>
      </div>
    );
  }

  const allStatuses = Object.values(LANES).flatMap((l) => l.statuses);
  const drafts = await db
    .select()
    .from(contentDrafts)
    .where(inArray(contentDrafts.status, allStatuses as ("script_draft")[]))
    .orderBy(desc(contentDrafts.createdAt))
    .limit(150);

  const byLane: Record<LaneKey, typeof drafts> = {
    clinician: [],
    editor: [],
    publish: [],
  };
  for (const d of drafts) {
    if (LANES.clinician.statuses.includes(d.status)) byLane.clinician.push(d);
    else if (LANES.editor.statuses.includes(d.status)) byLane.editor.push(d);
    else if (LANES.publish.statuses.includes(d.status)) byLane.publish.push(d);
  }

  return (
    <div className="container-page py-10 max-w-7xl">
      <header className="mb-6 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="pill-coral w-fit">Admin · Queue</p>
          <h1 className="mt-3 font-serif text-3xl text-ink-900">Today&apos;s queue</h1>
          <p className="mt-2 text-ink-600 max-w-prose">
            Three lanes, one decision per card. Anything stuck in <em>script_draft</em>{" "}
            longer than 12&nbsp;hours blocks the daily content cron.
          </p>
        </div>
        <Link href="/admin/drafts" className="pill">
          See all drafts →
        </Link>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {(Object.keys(LANES) as LaneKey[]).map((lane) => (
          <section key={lane} className="card p-4">
            <header className="mb-3">
              <h2 className="font-serif text-lg text-ink-900">{LANES[lane].title}</h2>
              <p className="text-xs text-ink-500 mt-1">{LANES[lane].tagline}</p>
              <p className="mt-2 text-xs text-ink-400">
                {byLane[lane].length} item{byLane[lane].length === 1 ? "" : "s"}
              </p>
            </header>
            {byLane[lane].length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-ink-500">
                Inbox zero ✓
              </div>
            ) : (
              <ul className="space-y-3">
                {byLane[lane].map((d) => (
                  <li key={d.id}>
                    <QueueActionCard
                      lane={lane}
                      draft={{
                        id: d.id,
                        kind: d.kind,
                        language: d.language,
                        brief: d.brief,
                        status: d.status,
                        videoUrl: d.videoUrl,
                        captionsSrt: d.captionsSrt,
                        scriptMd: d.scriptMd,
                        grounding: d.grounding ?? null,
                        createdAt: d.createdAt.toISOString(),
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <footer className="mt-10 card p-5 text-sm text-ink-600">
        <h3 className="font-serif text-lg text-ink-900 mb-2">How the queue works</h3>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>
            <strong>Clinician</strong> reads the script. Approves → moves to <em>editor</em>{" "}
            (and triggers a render in the background). Requests changes → bounces back to
            the author with reviewer notes.
          </li>
          <li>
            <strong>Editor</strong> watches the rendered video, checks caption + hashtags,
            approves → moves to <em>publish</em>.
          </li>
          <li>
            <strong>Publish</strong> tap fires the IG + YouTube uploads via{" "}
            <code>/api/admin/drafts/[id]/publish</code>. Failures land in{" "}
            <em>failed</em> with the platform error captured.
          </li>
        </ol>
      </footer>

      <noscript className="block mt-4 text-xs text-ink-400">
        JS is required for the queue actions.{" "}
        <Link href="/admin/drafts">Use the standard drafts list instead.</Link>
      </noscript>

      <SqlHintFooter />
    </div>
  );
}

async function SqlHintFooter() {
  if (!process.env.DATABASE_URL) return null;
  const stuck = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentDrafts)
    .where(
      sql`${contentDrafts.status} = 'script_draft' AND ${contentDrafts.createdAt} < now() - interval '12 hours'`,
    );
  const count = stuck[0]?.count ?? 0;
  if (count === 0) return null;
  return (
    <p className="mt-4 text-xs text-warn">
      {count} draft{count === 1 ? "" : "s"} stuck in <code>script_draft</code> &gt; 12h.
      The daily content cron will skip generating new ones until cleared.
    </p>
  );
}
