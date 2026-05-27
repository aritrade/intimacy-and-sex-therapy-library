import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts, resources } from "@/lib/db/schema";
import { auth } from "@/lib/auth/auth";
import { requireAdminPage } from "@/lib/auth/admin-page-guard";
import { isBasicAuthEnabled } from "@/lib/admin/auth";
import { parseScript, spokenWordCount } from "@/lib/social/script-parse";
import { DraftReviewActions } from "@/components/admin/DraftReviewActions";

export const dynamic = "force-dynamic";

type ReviewerNote = {
  reason: string;
  notes?: string;
  by: string;
  role: "clinician" | "editor" | "admin";
  ts: string;
};

export default async function DraftReview({ params }: { params: { id: string } }) {
  const guard = await requireAdminPage();
  if (guard) return guard;

  if (!process.env.DATABASE_URL) notFound();

  const rows = await db.select().from(contentDrafts).where(eq(contentDrafts.id, params.id)).limit(1);
  if (rows.length === 0) notFound();
  const draft = rows[0];

  // Source resource if cited
  let citedResource: { id: string; title: string; externalUrl: string; sourceId: string } | null = null;
  if (draft.resourceId) {
    const r = await db
      .select({
        id: resources.id,
        title: resources.title,
        externalUrl: resources.externalUrl,
        sourceId: resources.sourceId,
      })
      .from(resources)
      .where(eq(resources.id, draft.resourceId))
      .limit(1);
    citedResource = r[0] ?? null;
  }

  const parsed = parseScript(draft.scriptMd);
  const wordCount = spokenWordCount(parsed);
  const reviewerNotes: ReviewerNote[] = (draft.reviewerNotes ?? []) as ReviewerNote[];

  // Capability matrix derived from session role; basic-auth fallback users
  // get the full action set (the middleware already authorised them).
  const session = await auth();
  const sessionRoles = session?.user?.roles ?? [];
  const isBasicAuth = !session?.user?.id && isBasicAuthEnabled();
  const can = {
    clinicianApprove:
      isBasicAuth || sessionRoles.includes("clinician") || sessionRoles.includes("admin"),
    editorApprove:
      isBasicAuth || sessionRoles.includes("editor") || sessionRoles.includes("admin"),
    requestChanges:
      isBasicAuth ||
      sessionRoles.includes("clinician") ||
      sessionRoles.includes("editor") ||
      sessionRoles.includes("admin"),
    publish: isBasicAuth || sessionRoles.includes("editor") || sessionRoles.includes("admin"),
  };
  const reviewerRole: "clinician" | "editor" | "admin" = sessionRoles.includes("admin")
    ? "admin"
    : sessionRoles.includes("editor")
      ? "editor"
      : sessionRoles.includes("clinician")
        ? "clinician"
        : "admin"; // basic-auth fallback defaults to admin

  return (
    <div className="container-page py-10 max-w-4xl">
      <header className="mb-6">
        <p className="pill-coral w-fit">Draft · {draft.id.slice(0, 8)}</p>
        <h1 className="mt-3 font-serif text-3xl text-ink-900">Review &amp; gate</h1>
        <p className="mt-2 text-ink-600 text-sm flex flex-wrap gap-3">
          <span>
            Status: <strong className="text-ink-900">{draft.status.replaceAll("_", " ")}</strong>
          </span>
          <span>Kind: {draft.kind}</span>
          <span>Lang: {draft.language}</span>
          <span>Target: {parsed.durationSeconds ?? "—"}s</span>
          <span>≈ {wordCount} spoken words</span>
        </p>
      </header>

      <section className="card p-5">
        <h2 className="font-serif text-xl text-ink-900">Brief</h2>
        <p className="mt-2 text-sm text-ink-700 whitespace-pre-wrap">{draft.brief}</p>
      </section>

      {citedResource ? (
        <section className="card p-5 mt-4">
          <h2 className="font-serif text-xl text-ink-900">Cited resource</h2>
          <p className="mt-2 text-sm text-ink-700">{citedResource.title}</p>
          <p className="mt-1 text-xs text-ink-400 truncate">
            <a className="underline hover:text-ink-900" href={citedResource.externalUrl} target="_blank" rel="noreferrer">
              {citedResource.externalUrl}
            </a>
          </p>
        </section>
      ) : (
        <section className="card p-5 mt-4 border-coral/30 bg-coral/5">
          <h2 className="font-serif text-xl text-ink-900">No cited resource</h2>
          <p className="mt-2 text-sm text-ink-600">
            This script was generated without a source citation. The clinician
            should verify every factual claim has at least one peer-reviewed
            backing before approving.
          </p>
        </section>
      )}

      <section aria-label="Parsed script" className="grid gap-4 mt-4">
        {parsed.hook && (
          <SectionCard title="Hook" tone="accent">
            <p className="text-sm text-ink-800 leading-relaxed">{parsed.hook}</p>
          </SectionCard>
        )}

        {parsed.body.length > 0 && (
          <SectionCard title="Body" tone="default">
            <ol className="space-y-3">
              {parsed.body.map((b) => (
                <li key={b.index} className="flex gap-3">
                  <span className="shrink-0 inline-block w-7 text-right font-mono text-xs text-ink-400">
                    {b.index}.
                  </span>
                  <div className="min-w-0">
                    {b.seconds && (
                      <span className="pill text-[10px] mb-1">{b.seconds}s</span>
                    )}
                    <p className="text-sm text-ink-800 leading-relaxed">{b.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </SectionCard>
        )}

        {parsed.cta && (
          <SectionCard title="Call to action" tone="teal">
            <p className="text-sm text-ink-800 leading-relaxed">{parsed.cta}</p>
          </SectionCard>
        )}

        {parsed.caption && (
          <SectionCard title="Caption" tone="default">
            <p className="text-sm text-ink-800 whitespace-pre-wrap leading-relaxed">{parsed.caption}</p>
          </SectionCard>
        )}

        {parsed.hashtags.length > 0 && (
          <SectionCard title="Hashtags" tone="default">
            <div className="flex flex-wrap gap-1.5">
              {parsed.hashtags.map((h) => (
                <span key={h} className="pill text-xs">{h}</span>
              ))}
            </div>
          </SectionCard>
        )}

        {parsed.citation && (
          <SectionCard title="On-screen citation" tone="plum">
            <p className="text-sm text-ink-800 leading-relaxed">{parsed.citation}</p>
          </SectionCard>
        )}

        {parsed.extraSections.length > 0 &&
          parsed.extraSections.map((s) => (
            <SectionCard key={s.header} title={s.header} tone="default">
              <pre className="whitespace-pre-wrap text-xs text-ink-700 font-sans">{s.content}</pre>
            </SectionCard>
          ))}
      </section>

      {!parsed.hook && !parsed.body.length && draft.scriptMd && (
        <section className="card p-5 mt-4">
          <h2 className="font-serif text-xl text-ink-900">Script (raw)</h2>
          <p className="text-xs text-ink-400 mb-2">
            Could not parse this script into structured sections; showing the raw markdown.
          </p>
          <pre className="whitespace-pre-wrap text-sm text-ink-700 font-sans">{draft.scriptMd}</pre>
        </section>
      )}

      {draft.videoUrl && (
        <section className="card p-5 mt-4">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="font-serif text-xl text-ink-900">Rendered video</h2>
            <a
              href={draft.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-ink-400 underline hover:text-ink-900"
            >
              Open in new tab ↗
            </a>
          </div>
          <video
            controls
            preload="auto"
            playsInline
            src={draft.videoUrl}
            className="mt-3 w-full max-w-md rounded-xl border border-border bg-bg"
          />
          <p className="mt-2 text-[11px] text-ink-400 font-mono break-all">
            {draft.videoUrl}
          </p>
        </section>
      )}

      <section className="card p-5 mt-4">
        <h2 className="font-serif text-xl text-ink-900">Approvals</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <span className={draft.clinicianReviewerId ? "pill-accent" : "pill"}>
              {draft.clinicianReviewerId ? "Clinician ✓" : "Clinician —"}
            </span>
            <span className="text-ink-400 truncate">
              {draft.clinicianReviewerId ?? "Awaiting clinician approval"}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className={draft.editorReviewerId ? "pill-accent" : "pill"}>
              {draft.editorReviewerId ? "Editor ✓" : "Editor —"}
            </span>
            <span className="text-ink-400 truncate">
              {draft.editorReviewerId ?? "Awaiting editor approval"}
            </span>
          </li>
        </ul>
      </section>

      {reviewerNotes.length > 0 && (
        <section className="card p-5 mt-4">
          <h2 className="font-serif text-xl text-ink-900">Reviewer notes</h2>
          <ul className="mt-3 space-y-3">
            {reviewerNotes.map((n, i) => (
              <li key={i} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="pill-coral">{n.role}</span>
                  <span className="pill">{n.reason.replaceAll("_", " ")}</span>
                  <span className="ml-auto font-mono text-ink-400">
                    {new Date(n.ts).toLocaleString()}
                  </span>
                </div>
                {n.notes && (
                  <p className="mt-2 text-sm text-ink-700 whitespace-pre-wrap">{n.notes}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <DraftReviewActions
        draft={{
          id: draft.id,
          status: draft.status,
          videoUrl: draft.videoUrl,
          clinicianReviewerId: draft.clinicianReviewerId,
          editorReviewerId: draft.editorReviewerId,
          reviewerNotes,
        }}
        capabilities={can}
        reviewerRole={reviewerRole}
      />

      <Link href="/admin/drafts" className="mt-6 inline-block text-sm text-ink-400 hover:text-ink-900">
        ← Back to drafts queue
      </Link>
    </div>
  );
}

function SectionCard({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "default" | "accent" | "teal" | "plum";
  children: React.ReactNode;
}) {
  const pillClass =
    tone === "accent"
      ? "pill-accent"
      : tone === "teal"
        ? "pill-teal"
        : tone === "plum"
          ? "pill-plum"
          : "pill";
  return (
    <div className="card p-5">
      <span className={pillClass}>{title}</span>
      <div className="mt-3">{children}</div>
    </div>
  );
}
