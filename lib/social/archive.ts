/**
 * Soft-archive settled posted/taken-down drafts.
 *
 * We do NOT change status — the metrics poller reads
 * status in ('posted','taken_down') for the last 30 days
 * (lib/social/metrics-poller.ts) and must keep working. We only stamp
 * `archived_at` so the admin drafts list can hide long-settled drafts from
 * the default view while keeping them reachable under an "archived" filter.
 *
 * The default window (45 days) is deliberately >= the metrics poll window so
 * a draft is only archived once the poller has stopped caring about it.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { recordAudit } from "@/lib/observability/audit";

/** Default window, robust to an empty-string env (GH Actions sets "" for an
 *  omitted workflow input — Number("") is 0, which would archive everything). */
function defaultArchiveDays(): number {
  const raw = (process.env.ARCHIVE_AFTER_DAYS ?? "").trim();
  const n = Number(raw);
  return raw !== "" && Number.isFinite(n) && n >= 0 ? n : 45;
}

export const ARCHIVE_AFTER_DAYS = defaultArchiveDays();

export type ArchiveResult = { archived: number; olderThanDays: number };

export async function archivePostedDrafts(opts?: {
  olderThanDays?: number;
  actor?: string;
}): Promise<ArchiveResult> {
  const days = Math.max(0, opts?.olderThanDays ?? ARCHIVE_AFTER_DAYS);
  const actor = opts?.actor ?? "system:archive";

  const rows = (await db.execute(sql`
    UPDATE content_drafts
       SET archived_at = now()
     WHERE status IN ('posted', 'taken_down')
       AND posted_at IS NOT NULL
       AND posted_at < now() - (${days} * interval '1 day')
       AND archived_at IS NULL
    RETURNING id
  `)) as unknown as Array<{ id: string }>;

  const archived = rows.length;
  await recordAudit({
    actor,
    action: "drafts_archived",
    meta: { archived, olderThanDays: days },
  });
  return { archived, olderThanDays: days };
}
