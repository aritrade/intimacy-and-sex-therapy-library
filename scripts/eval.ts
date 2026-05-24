/**
 * CLI for the eval / red-team harness.
 *
 *   tsx scripts/eval.ts                       # run full set
 *   tsx scripts/eval.ts --category=jailbreak  # run only one category
 *   tsx scripts/eval.ts --limit=5             # smoke test
 *
 * Writes a JSON report to ./eval-reports/<timestamp>.json. Inserts a single
 * aggregate row into eval_runs when DATABASE_URL is configured.
 *
 * NOTE: Per-prompt response snippets are written ONLY to the on-disk report,
 * never to the database, to keep the audit log content-free.
 */

import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runEval } from "../lib/eval/runner";
import { db } from "../lib/db/client";
import { evalRuns } from "../lib/db/schema";
import type { RedTeamCategory } from "../lib/eval/redteam";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filterCategory = args.category as RedTeamCategory | undefined;
  const limit = args.limit ? Number(args.limit) : undefined;

  console.log(
    `[eval] starting · category=${filterCategory ?? "all"} · limit=${limit ?? "none"}`,
  );

  const report = await runEval({ filterCategory, limit });

  const dir = join(process.cwd(), "eval-reports");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${report.startedAt.replace(/[:.]/g, "-")}.json`);
  await writeFile(file, JSON.stringify(report, null, 2), "utf-8");

  console.log(`[eval] wrote ${file}`);
  console.log("[eval] aggregate:");
  for (const [k, v] of Object.entries(report.aggregate)) {
    console.log(`  ${k}: ${(v as number).toFixed(3)}`);
  }

  if (process.env.DATABASE_URL) {
    try {
      const failedBias = report.results
        .filter((r) => !r.biasAuditPass)
        .map((r) => ({ id: r.id, category: r.category }));

      await db.insert(evalRuns).values({
        modelId: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
        promptSetVersion: report.promptSetVersion,
        refusalRate: Math.round(report.aggregate.refusalCorrectnessRate * 10000),
        citationFaithfulness: Math.round(
          report.aggregate.citationFaithfulnessRate * 10000,
        ),
        empathyScore: Math.round(report.aggregate.avgEmpathy * 100),
        biasFlags: {
          biasAuditPassRate: report.aggregate.biasAuditPassRate,
          keywordCompliancePct: report.aggregate.keywordCompliancePct,
          total: report.total,
          failed: failedBias,
        },
      });
      console.log("[eval] aggregate row written to eval_runs");
    } catch (err) {
      console.warn("[eval] failed to insert aggregate row:", (err as Error).message);
    }
  } else {
    console.log("[eval] DATABASE_URL not set — skipping eval_runs insert");
  }
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.+)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

main().catch((err) => {
  console.error("[eval] failed:", err);
  process.exit(1);
});
