import { NextResponse } from "next/server";
import { z } from "zod";
import { score } from "@/lib/assessments/scoring";
import { INSTRUMENTS } from "@/lib/assessments/instruments";

export const runtime = "nodejs";

const Body = z.object({
  instrumentId: z.enum(["phq9", "gad7", "nsss-s"]),
  answers: z.record(z.string(), z.number().int().min(0).max(5)),
});

/**
 * Stateless scoring endpoint. Returns the score only; never persists answers.
 * Persistence is opt-in and lands in a separate authenticated route once Clerk
 * is wired (P14). For now, the result lives only in the user's browser.
 *
 * Audit-log row written for the *event* (not the answers): {instrument, flag}.
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { instrumentId, answers } = parsed.data;
  const inst = INSTRUMENTS[instrumentId];

  // Validate that all expected items are present
  const missing = inst.items.filter((it) => answers[it.id] === undefined);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "incomplete", missing: missing.map((m) => m.id) },
      { status: 422 },
    );
  }

  const result = score(instrumentId, answers);
  return NextResponse.json({
    instrumentId,
    name: inst.name,
    result,
    citation: inst.citation,
    license: inst.license,
  });
}
