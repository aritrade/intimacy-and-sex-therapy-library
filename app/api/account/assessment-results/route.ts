import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { assessmentResults } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/assessment-results
 *
 * Persists ONLY the score, severity, and flag list of a completed
 * assessment. Never stores the user's individual answers. Called by
 * AssessmentForm on a successful score, best-effort.
 */
const Body = z.object({
  instrumentId: z.string().min(2).max(64),
  rawScore: z.number().int().min(0).max(200),
  severity: z.string().min(2).max(32),
  flags: z.array(z.string()).max(16).default([]),
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
  const { instrumentId, rawScore, severity, flags } = parsed.data;

  const inserted = await db
    .insert(assessmentResults)
    .values({ userId: gate.userId, instrumentId, rawScore, severity, flags })
    .returning({ id: assessmentResults.id });

  return NextResponse.json({ id: inserted[0].id }, { status: 201 });
}
