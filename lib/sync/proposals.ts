/**
 * Shared helpers for the daily content-sync agents.
 *
 * Every agent (link-health, freshness, discovery) emits proposals
 * through `submitProposal()`. This is the only writer for the
 * `resource_proposals` table outside the admin approve / reject
 * endpoints.
 *
 * Deduplication: the same agent should not emit the same proposal
 * twice in a row. We hash a stable subset of the payload and check
 * for an existing OPEN proposal with the same digest.
 */

import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { resourceProposals } from "@/lib/db/schema";

export type ProposalKind =
  | "fix_url"
  | "needs_refresh"
  | "new_resource"
  | "remove_resource"
  | "metadata_drift";

export type SubmitProposalInput = {
  kind: ProposalKind;
  proposedBy: string;
  resourceId?: string;
  payload: Record<string, unknown>;
  summary: string;
  evidence?: Record<string, unknown>;
  /** 0–100 confidence; the admin list sorts by this. */
  confidence?: number;
};

export async function submitProposal(input: SubmitProposalInput): Promise<{
  inserted: boolean;
  id: string | null;
}> {
  const digest = digestForDedup(input);

  const existing = await db
    .select({ id: resourceProposals.id })
    .from(resourceProposals)
    .where(
      and(
        eq(resourceProposals.kind, input.kind),
        eq(resourceProposals.proposedBy, input.proposedBy),
        eq(resourceProposals.status, "open"),
        sql`${resourceProposals.payload}->>'_digest' = ${digest}`,
      ),
    )
    .limit(1);

  if (existing[0]) {
    return { inserted: false, id: existing[0].id };
  }

  const inserted = await db
    .insert(resourceProposals)
    .values({
      kind: input.kind,
      proposedBy: input.proposedBy,
      resourceId: input.resourceId ?? null,
      payload: { ...input.payload, _digest: digest },
      summary: input.summary,
      evidence: input.evidence ?? {},
      confidence: clamp(input.confidence ?? 50, 0, 100),
      status: "open",
    })
    .returning({ id: resourceProposals.id });

  return { inserted: true, id: inserted[0]?.id ?? null };
}

function digestForDedup(input: SubmitProposalInput): string {
  // Different agents dedupe on different fields; use the union of
  // resourceId + a stable subset of payload.
  const stable = JSON.stringify({
    kind: input.kind,
    resourceId: input.resourceId ?? null,
    payload: {
      ...input.payload,
      // Fields that are noise (timestamps etc.) get stripped.
      _digest: undefined,
      ranAt: undefined,
    },
  });
  return createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
