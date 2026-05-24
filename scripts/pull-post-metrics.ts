/**
 * CLI entry for the post-metrics poller.
 *
 * Usage:
 *   npm run social:pull-metrics              # default window (30 days, 50 drafts)
 *   tsx scripts/pull-post-metrics.ts --days=7 --limit=20
 *
 * Designed for two callers:
 *   1. A weekly GitHub Actions schedule (.github/workflows/post-metrics.yml).
 *   2. The "Refresh now" button on the admin dashboard, which hits
 *      POST /api/admin/post-metrics/poll instead — same code path.
 */

import "dotenv/config";
import { pollAllPostMetrics } from "../lib/social/metrics-poller";

function flag(name: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const v = Number(arg.split("=")[1]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(
      "DATABASE_URL is not set — refusing to poll. Set it in your environment and retry.",
    );
    process.exit(0);
  }
  const limit = flag("limit", 50);
  const windowDays = flag("days", 30);

  console.log(`Polling post metrics — limit=${limit}, days=${windowDays}`);
  const summary = await pollAllPostMetrics({ limit, windowDays });
  console.log(JSON.stringify(summary, null, 2));

  if (summary.takedowns > 0) {
    console.log(
      `\nALERT — ${summary.takedowns} takedown(s) detected. Open /admin to review.`,
    );
    process.exit(2); // distinguishable exit so cron alarms can fire
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
