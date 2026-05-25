/**
 * Sync-agent proposals queue.
 *
 * Three lanes:
 *   1. fix_url           — link-health agent suggests a replacement URL.
 *   2. needs_refresh     — freshness agent flags stale resources.
 *   3. new_resource      — discovery agent suggests new content to add.
 * (remove_resource and metadata_drift collapse into a "review" lane.)
 *
 * Each card shows the proposal's evidence and a one-click approve /
 * reject pair. Approval applies the change immediately for safe kinds
 * (fix_url, needs_refresh, remove_resource) or surfaces a manual-step
 * hint for new_resource (which needs the ingest pipeline).
 */

import Link from "next/link";
import { desc, eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resourceProposals, resources } from "@/lib/db/schema";
import { requireAdminPage } from "@/lib/auth/admin-page-guard";
import { ProposalCard } from "@/components/admin/ProposalCard";

export const metadata = { title: "Proposals · Admin" };
export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  fix_url: "Replace broken URL",
  needs_refresh: "Needs refresh",
  new_resource: "New candidate",
  remove_resource: "Remove resource",
  metadata_drift: "Metadata drift",
};

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams?: { kind?: string; status?: string };
}) {
  const guard = await requireAdminPage();
  if (guard) return guard;

  if (!process.env.DATABASE_URL) {
    return (
      <div className="container-page py-10 max-w-5xl">
        <div className="card p-8 text-sm text-ink-600">
          <h1 className="font-serif text-xl text-ink-900 mb-2">DATABASE_URL not configured</h1>
        </div>
      </div>
    );
  }

  const filterKind = searchParams?.kind && KIND_LABELS[searchParams.kind] ? searchParams.kind : null;
  const filterStatus = ["open", "approved", "rejected", "applied", "errored"].includes(
    searchParams?.status ?? "",
  )
    ? searchParams!.status!
    : "open";

  const rows = await db
    .select({
      proposal: resourceProposals,
      resource: {
        title: resources.title,
        externalUrl: resources.externalUrl,
      },
    })
    .from(resourceProposals)
    .leftJoin(resources, eq(resources.id, resourceProposals.resourceId))
    .where(
      filterKind
        ? and(
            eq(resourceProposals.kind, filterKind as "fix_url"),
            eq(resourceProposals.status, filterStatus as "open"),
          )
        : eq(resourceProposals.status, filterStatus as "open"),
    )
    .orderBy(desc(resourceProposals.confidence), desc(resourceProposals.createdAt))
    .limit(100);

  // Group by kind for display.
  const grouped: Record<string, typeof rows> = {
    fix_url: [],
    needs_refresh: [],
    new_resource: [],
    remove_resource: [],
    metadata_drift: [],
  };
  for (const r of rows) {
    grouped[r.proposal.kind]?.push(r);
  }

  return (
    <div className="container-page py-10 max-w-6xl">
      <header className="mb-6">
        <p className="pill-coral w-fit">Admin · Sync proposals</p>
        <h1 className="mt-3 font-serif text-3xl text-ink-900">Catalog sync proposals</h1>
        <p className="mt-2 text-ink-600 max-w-prose">
          The daily sync agents (link-health, freshness, discovery) propose changes
          here instead of mutating the catalog directly. You approve, reject, or
          edit each one.
        </p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2 text-sm">
        <FilterPill
          href={`/admin/proposals?status=${filterStatus}`}
          label={`All open (${rows.length})`}
          active={!filterKind}
        />
        {Object.keys(KIND_LABELS).map((k) => (
          <FilterPill
            key={k}
            href={`/admin/proposals?status=${filterStatus}&kind=${k}`}
            label={`${KIND_LABELS[k]} (${grouped[k]?.length ?? 0})`}
            active={filterKind === k}
          />
        ))}
        <span className="ml-auto flex gap-2">
          {(["open", "approved", "rejected", "applied", "errored"] as const).map((s) => (
            <Link
              key={s}
              href={`/admin/proposals?status=${s}`}
              className={`pill text-[11px] ${filterStatus === s ? "ring-2 ring-accent" : "opacity-60 hover:opacity-100"}`}
            >
              {s}
            </Link>
          ))}
        </span>
      </nav>

      {rows.length === 0 ? (
        <div className="card p-8 text-sm text-ink-500">
          No {filterStatus} proposals{filterKind ? ` of kind ${filterKind}` : ""}. The agents
          run at 03:00 IST daily; check back tomorrow.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.proposal.id}>
              <ProposalCard
                proposal={{
                  id: r.proposal.id,
                  kind: r.proposal.kind,
                  proposedBy: r.proposal.proposedBy,
                  resourceId: r.proposal.resourceId,
                  resourceTitle: r.resource?.title ?? null,
                  resourceUrl: r.resource?.externalUrl ?? null,
                  payload: r.proposal.payload,
                  summary: r.proposal.summary,
                  evidence: r.proposal.evidence ?? {},
                  confidence: r.proposal.confidence,
                  status: r.proposal.status,
                  createdAt: r.proposal.createdAt.toISOString(),
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterPill({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`pill ${active ? "ring-2 ring-accent ring-offset-1 ring-offset-bg" : "opacity-80 hover:opacity-100"}`}
    >
      {label}
    </Link>
  );
}
