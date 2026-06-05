/**
 * Soft-archive settled posted/taken-down drafts (CLI / cron entrypoint).
 *
 *   npm run archive:drafts                 # uses ARCHIVE_AFTER_DAYS (default 45)
 *   ARCHIVE_AFTER_DAYS=60 npm run archive:drafts
 *   npm run archive:drafts -- --days=90
 *
 * Stamps content_drafts.archived_at; never changes status. Safe to run daily.
 */

import "dotenv/config";
import { archivePostedDrafts } from "../lib/social/archive";

function parseDays(argv: string[]): number | undefined {
  for (const a of argv) {
    const m = a.match(/^--days=(\d+)$/);
    if (m) return Number(m[1]);
  }
  return undefined;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(2);
  }
  const olderThanDays = parseDays(process.argv.slice(2));
  const res = await archivePostedDrafts({ olderThanDays, actor: "cron:gh-actions" });
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
