import { redirect } from "next/navigation";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { auth, signOut } from "@/lib/auth/auth";
import { db } from "@/lib/db/client";
import {
  assessmentResults,
  userPathProgress,
  vaultEntries,
} from "@/lib/db/schema";
import { ForgetMeButton } from "@/components/ForgetMeButton";
import { Sparkline } from "@/components/assessments/Sparkline";
import { scoreMeta } from "@/lib/assessments/score-meta";

export const metadata = { title: "Your account · Intimacy & Sex Therapy Library" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }
  const userId = session.user.id;

  const dbReady = !!process.env.DATABASE_URL;
  const [assessments, paths, vaults] = dbReady
    ? await Promise.all([
        db
          .select()
          .from(assessmentResults)
          .where(eq(assessmentResults.userId, userId))
          .orderBy(asc(assessmentResults.takenAt))
          .limit(500),
        db
          .select()
          .from(userPathProgress)
          .where(eq(userPathProgress.userId, userId))
          .orderBy(desc(userPathProgress.completedAt))
          .limit(50),
        db
          .select({
            id: vaultEntries.id,
            label: vaultEntries.label,
            createdAt: vaultEntries.createdAt,
          })
          .from(vaultEntries)
          .where(eq(vaultEntries.userId, userId))
          .orderBy(desc(vaultEntries.createdAt))
          .limit(50),
      ])
    : [[], [], []];

  type Take = (typeof assessments)[number];
  const byInstrument = new Map<string, Take[]>();
  for (const a of assessments) {
    const arr = byInstrument.get(a.instrumentId) ?? [];
    arr.push(a);
    byInstrument.set(a.instrumentId, arr);
  }
  const trendGroups = Array.from(byInstrument.entries())
    .map(([instrumentId, takes]) => ({ instrumentId, takes }))
    .sort(
      (a, b) =>
        +new Date(b.takes[b.takes.length - 1].takenAt) -
        +new Date(a.takes[a.takes.length - 1].takenAt),
    );

  return (
    <div className="container-page py-10 max-w-3xl">
      <header className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="pill-accent w-fit">Your account</p>
          <h1 className="mt-3 font-serif text-3xl text-ink-900">
            {session.user.name ?? session.user.email ?? "Welcome"}
          </h1>
          <p className="mt-2 text-ink-600">
            Saved data lives here. The site works without it; signing in just
            keeps continuity between visits.
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit" className="btn-secondary">
            Sign out
          </button>
        </form>
      </header>

      <section className="card p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-xl text-ink-900">Assessment history</h2>
          <Link href="/assessments" className="text-sm text-accent-ink underline">
            Take one
          </Link>
        </div>
        {trendGroups.length === 0 ? (
          <p className="mt-2 text-sm text-ink-400">
            Nothing saved yet. Take a public-domain self-assessment and your
            score lands here. We never store your individual answers.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {trendGroups.map((g) => (
              <li key={g.instrumentId}>
                <AssessmentTrendCard instrumentId={g.instrumentId} takes={g.takes} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5 mt-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-xl text-ink-900">Learning paths</h2>
          <Link href="/paths" className="text-sm text-accent-ink underline">
            Browse paths
          </Link>
        </div>
        {paths.length === 0 ? (
          <p className="mt-2 text-sm text-ink-400">No path progress saved yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {paths.map((p) => (
              <li key={`${p.pathSlug}-${p.stepIndex}`} className="flex items-center gap-2">
                <span className="pill-teal">{p.pathSlug}</span>
                <span className="text-ink-700">
                  step <strong>{p.stepIndex + 1}</strong>
                </span>
                <span className="ml-auto text-xs text-ink-400">
                  {new Date(p.completedAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5 mt-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-xl text-ink-900">Encrypted vault</h2>
          <Link href="/companion" className="text-sm text-accent-ink underline">
            Open Sahay
          </Link>
        </div>
        {vaults.length === 0 ? (
          <p className="mt-2 text-sm text-ink-400">
            Nothing in the vault yet. Sahay can save conversations here in
            ciphertext only — we never see your passphrase or the decrypted
            content.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {vaults.map((v) => (
              <li key={v.id} className="flex items-center gap-2">
                <span className="pill-plum">vault</span>
                <span className="text-ink-700">{v.label}</span>
                <span className="ml-auto text-xs text-ink-400">
                  {new Date(v.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5 mt-4 border-coral/30 bg-coral-soft/40">
        <h2 className="font-serif text-xl text-ink-900">Forget me</h2>
        <p className="mt-1 text-sm text-ink-700">
          Hard-deletes everything tied to this account: profile, role grants,
          assessment scores, path progress, and vault ciphertext. Cannot be
          undone. Required by DPDP Act 2023 §13 and GDPR Article 17.
        </p>
        <ForgetMeButton />
      </section>
    </div>
  );
}

function AssessmentTrendCard({
  instrumentId,
  takes,
}: {
  instrumentId: string;
  takes: Array<{ id: string; rawScore: number; severity: string; flags: unknown; takenAt: Date | string }>;
}) {
  const meta = scoreMeta(instrumentId);
  const name = meta?.shortName ?? instrumentId;
  const suffix = meta?.suffix ?? "";
  const betterWhenHigher = meta?.betterWhenHigher ?? true;

  const latest = takes[takes.length - 1];
  const previous = takes.length > 1 ? takes[takes.length - 2] : null;
  const values = takes.map((t) => t.rawScore);
  const max = meta && meta.maxScore > 0 ? meta.maxScore : Math.max(...values, 1);

  const delta = previous ? latest.rawScore - previous.rawScore : null;
  const improving =
    delta != null && delta !== 0 && ((delta < 0 && !betterWhenHigher) || (delta > 0 && betterWhenHigher));
  const worsening =
    delta != null && delta !== 0 && !improving;

  const trendColor = improving ? "text-ok" : worsening ? "text-warn" : "text-ink-400";
  const isUrgent = Array.isArray(latest.flags) && (latest.flags as string[]).includes("urgent");

  let changeText: string;
  if (delta == null) changeText = "First result";
  else if (delta === 0) changeText = "No change since last time";
  else {
    const arrow = delta > 0 ? "↑" : "↓";
    changeText = `${arrow} ${Math.abs(delta)}${suffix} since last · ${improving ? "improving" : "worth watching"}`;
  }

  return (
    <div className="card p-4 h-full">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-ink-900">{name}</p>
          <p className="mt-0.5 text-sm text-ink-600">
            {latest.severity} · <strong>{latest.rawScore}{suffix}</strong>
            {meta && meta.maxScore > 0 ? <span className="text-ink-400">/{meta.maxScore}{suffix}</span> : null}
          </p>
        </div>
        {isUrgent && <span className="pill-coral shrink-0">crisis flag</span>}
      </div>

      <div className={`mt-3 ${trendColor}`}>
        <Sparkline values={values} max={max} />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className={trendColor}>{changeText}</span>
        <span className="text-ink-400">
          {takes.length} {takes.length === 1 ? "take" : "takes"}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <Link href={`/assessments/${instrumentId}`} className="text-sm text-accent-ink underline">
          Take again
        </Link>
        <span className="text-xs text-ink-400">
          {new Date(latest.takenAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
