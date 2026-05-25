/**
 * Freshness agent.
 *
 * Walks every published resource and flags ones that are likely stale.
 * Two signals:
 *   1. publishedAt > 18 months old (default; configurable per kind).
 *   2. Last clinical review (if any) is overdue. Reviews live in the
 *      `reviews` table with a `nextReviewDue` timestamp.
 *
 * Emits `needs_refresh` proposals. The admin reviewer can then either
 * (a) approve → triggers a re-ingest pipeline run, or (b) reject if
 * the resource is intentionally evergreen (e.g. AASECT 2016 position
 * paper that hasn't been superseded).
 *
 * Per-kind thresholds reflect how fast each content category becomes
 * stale: clinical guidelines move fast, books and historical reviews
 * move slowly.
 */

import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resources, reviews } from "@/lib/db/schema";
import { submitProposal } from "./proposals";

const PROPOSED_BY = "agent:freshness";

const STALENESS_DAYS_BY_KIND: Record<string, number> = {
  // Clinical / research items rotate fastest.
  article: 18 * 30,
  paper: 18 * 30,
  guideline: 12 * 30,
  // Books & full-length resources slow down significantly.
  book: 7 * 365,
  monograph: 7 * 365,
  // Multimedia drifts in usefulness somewhere in between.
  video: 3 * 365,
  podcast: 3 * 365,
  // Default fallback.
  default: 24 * 30,
};

export type FreshnessSummary = {
  scanned: number;
  staleByPublishedAt: number;
  reviewOverdue: number;
  proposalsEmitted: number;
};

export async function runFreshnessAgent(): Promise<FreshnessSummary> {
  const summary: FreshnessSummary = {
    scanned: 0,
    staleByPublishedAt: 0,
    reviewOverdue: 0,
    proposalsEmitted: 0,
  };

  const now = new Date();

  // 1) Stale by publishedAt
  const rows = await db
    .select({
      id: resources.id,
      title: resources.title,
      kind: resources.kind,
      publishedAt: resources.publishedAt,
    })
    .from(resources)
    .where(eq(resources.isPublished, true));

  for (const r of rows) {
    summary.scanned += 1;
    if (!r.publishedAt) continue;
    const ageDays = (now.getTime() - new Date(r.publishedAt).getTime()) / 86_400_000;
    const threshold = STALENESS_DAYS_BY_KIND[r.kind] ?? STALENESS_DAYS_BY_KIND.default;
    if (ageDays > threshold) {
      summary.staleByPublishedAt += 1;
      const result = await submitProposal({
        kind: "needs_refresh",
        proposedBy: PROPOSED_BY,
        resourceId: r.id,
        payload: {
          reason: "stale_published_at",
          ageDays: Math.round(ageDays),
          thresholdDays: threshold,
          kind: r.kind,
        },
        summary: `Refresh "${r.title.slice(0, 60)}" — ${Math.round(
          ageDays / 30,
        )} mo old (threshold ${Math.round(threshold / 30)} mo)`,
        evidence: {
          publishedAt: r.publishedAt.toISOString(),
          policy: "STALENESS_DAYS_BY_KIND",
        },
        confidence: ageDays > threshold * 1.5 ? 75 : 55,
      });
      if (result.inserted) summary.proposalsEmitted += 1;
    }
  }

  // 2) Clinical reviews overdue
  const overdue = await db
    .select({
      id: resources.id,
      title: resources.title,
      reviewedAt: reviews.reviewedAt,
      nextReviewDue: reviews.nextReviewDue,
    })
    .from(resources)
    .innerJoin(reviews, eq(reviews.resourceId, resources.id))
    .where(
      and(
        eq(resources.isPublished, true),
        sql`${reviews.nextReviewDue} < ${now}`,
      ),
    );

  for (const r of overdue) {
    summary.reviewOverdue += 1;
    const result = await submitProposal({
      kind: "needs_refresh",
      proposedBy: PROPOSED_BY,
      resourceId: r.id,
      payload: {
        reason: "review_overdue",
        reviewedAt: r.reviewedAt.toISOString(),
        nextReviewDue: r.nextReviewDue.toISOString(),
        overdueDays: Math.round((now.getTime() - new Date(r.nextReviewDue).getTime()) / 86_400_000),
      },
      summary: `Clinical review overdue for "${r.title.slice(0, 60)}"`,
      evidence: { source: "reviews_table" },
      confidence: 80,
    });
    if (result.inserted) summary.proposalsEmitted += 1;
  }

  return summary;
}
