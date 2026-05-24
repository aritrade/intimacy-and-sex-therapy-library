import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { auth, signOut } from "@/lib/auth/auth";
import { db } from "@/lib/db/client";
import {
  assessmentResults,
  userPathProgress,
  vaultEntries,
} from "@/lib/db/schema";
import { ForgetMeButton } from "@/components/ForgetMeButton";

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
          .orderBy(desc(assessmentResults.takenAt))
          .limit(20),
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
        {assessments.length === 0 ? (
          <p className="mt-2 text-sm text-ink-400">
            Nothing saved yet. Take a public-domain self-assessment and your
            score lands here. We never store your individual answers.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {assessments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 flex-wrap">
                <span className="pill">{a.instrumentId}</span>
                <span className="text-ink-700">
                  score <strong>{a.rawScore}</strong> · {a.severity}
                </span>
                {(a.flags as string[] | null)?.includes("urgent") && (
                  <span className="pill-coral">crisis flag</span>
                )}
                <span className="ml-auto text-xs text-ink-400">
                  {new Date(a.takenAt).toLocaleString()}
                </span>
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
