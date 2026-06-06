import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { assessmentResults } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/assessment-results
 *
 * Persists ONLY the score, severity, and flag list of a completed
 * assessment. Never stores the user's individual answers.
 *
 * The browser-held results store is the source of truth: ResultsSync replays
 * unsynced results here (with their original `takenAt`). The write is
 * idempotent on (userId, instrumentId, takenAt) so replaying on every load /
 * sign-in can't create duplicates.
 */
const Body = z.object({
  instrumentId: z.string().min(2).max(64),
  rawScore: z.number().int().min(0).max(200),
  severity: z.string().min(2).max(64),
  flags: z.array(z.string()).max(16).default([]),
  takenAt: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const gate = await requireAuth();
  if (!gate.ok) return gate.response;
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const { instrumentId, rawScore, severity, flags, takenAt } = parsed.data;
  const takenAtDate = takenAt ? new Date(takenAt) : new Date();

  // Idempotency: a result with the same (user, instrument, exact timestamp)
  // is the same completed run being replayed by the client sync.
  const existing = await db
    .select({ id: assessmentResults.id })
    .from(assessmentResults)
    .where(
      and(
        eq(assessmentResults.userId, gate.userId),
        eq(assessmentResults.instrumentId, instrumentId),
        eq(assessmentResults.takenAt, takenAtDate),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ id: existing[0].id, deduped: true }, { status: 200 });
  }

  const inserted = await db
    .insert(assessmentResults)
    .values({ userId: gate.userId, instrumentId, rawScore, severity, flags, takenAt: takenAtDate })
    .returning({ id: assessmentResults.id });

  return NextResponse.json({ id: inserted[0].id }, { status: 201 });
}
