/**
 * One-shot cleanup: re-open `new_resource` proposals that errored
 * against the OLD apply-path placeholder.
 *
 * Background. Before commit bed7645 ("real new_resource apply",
 * 2026-05-27 12:08 IST), `applyProposal` for kind="new_resource"
 * returned `{ ok: false, error: "manual_step_required" }` as a
 * stub. Any proposal an admin approved before that ship landed in
 * `status='errored'` with the old placeholder error. Those rows are
 * now stranded — `/api/admin/proposals/[id]/decide` rejects re-
 * approval with HTTP 409 because it requires `status='open'`.
 *
 * The forensic that motivated this script:
 *   - 13 `proposal_apply_failed` audit events between 2026-05-27
 *     06:32 and 06:35 UTC.
 *   - All failed with `error: "manual_step_required"`.
 *   - bed7645 shipped at 12:08 IST = 06:38 UTC, three minutes
 *     after the last failure.
 *
 * What this script does:
 *   - Finds every row in `resource_proposals` where:
 *       status         = 'errored'
 *       kind           = 'new_resource'
 *       applied_result ->> 'error' = 'manual_step_required'
 *   - Resets each one to status='open', clears applied_result,
 *     decidedBy, decidedAt, and decisionNotes so the proposals
 *     UI treats them as fresh again.
 *   - Prints a summary and exits.
 *
 * Pass `--dry-run` to see the count without mutating.
 *
 * Idempotent — running twice on a clean DB updates 0 rows.
 *
 * After this script, those proposals re-appear in /admin/proposals
 * (open lane). Admin can approve them and the (now real)
 * `applyNewResource` will insert UNPUBLISHED rows in `resources`.
 */

import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import { resourceProposals } from "../lib/db/schema";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set. Aborting.");
    process.exit(1);
  }

  const matchClause = and(
    eq(resourceProposals.status, "errored"),
    eq(resourceProposals.kind, "new_resource"),
    sql`${resourceProposals.appliedResult}->>'error' = 'manual_step_required'`,
  );

  const candidates = await db
    .select({
      id: resourceProposals.id,
      summary: resourceProposals.summary,
    })
    .from(resourceProposals)
    .where(matchClause);

  console.log(
    `Found ${candidates.length} stranded errored new_resource proposals.`,
  );
  for (const c of candidates) {
    console.log(`  - ${c.id}  ${c.summary.slice(0, 80)}`);
  }

  if (candidates.length === 0) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: not mutating. Re-run without the flag to reopen.");
    process.exit(0);
  }

  const updated = await db
    .update(resourceProposals)
    .set({
      status: "open",
      appliedResult: null,
      decidedBy: null,
      decidedAt: null,
      decisionNotes: null,
    })
    .where(matchClause)
    .returning({ id: resourceProposals.id });

  console.log(`\nReopened ${updated.length} proposals.`);
  console.log("They will reappear in /admin/proposals?status=open.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
