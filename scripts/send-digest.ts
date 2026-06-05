/**
 * Weekly digest sender (CLI / cron entrypoint).
 *
 *   npm run send:digest                 # build + send to confirmed list
 *   npm run send:digest -- --dry-run    # build + count recipients, no send
 *   npm run send:digest -- --days=14    # widen the "new resources" window
 *
 * Sends via Amazon SES (throttled). Fail-soft per recipient; logs a summary.
 */

import "dotenv/config";
import { sendDigest } from "../lib/email/digest";

function parseDays(argv: string[]): number | undefined {
  for (const a of argv) {
    const m = a.match(/^--days=(\d+)$/);
    if (m) return Number(m[1]);
  }
  return undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(2);
  }
  const res = await sendDigest({ sinceDays: parseDays(argv), dryRun });
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
