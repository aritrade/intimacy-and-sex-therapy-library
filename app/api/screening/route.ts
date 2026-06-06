import { NextResponse } from "next/server";
import { z } from "zod";
import { reflect } from "@/lib/screening/reflect";
import { isLlmConfigured } from "@/lib/ai/llm";
import { clientFingerprint, rateLimit } from "@/lib/ratelimit";
import { log } from "@/lib/observability/logger";
import { hashForCorrelation } from "@/lib/observability/scrub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 10 * 60 * 1000;

const Body = z.object({
  results: z
    .array(
      z.object({
        instrumentId: z.string(),
        rawScore: z.number(),
        maxScore: z.number(),
        scoreSuffix: z.string().optional(),
        severityLabel: z.string().max(120),
        flag: z.enum(["safe", "monitor", "clinician_recommended", "urgent"]),
        crisisSignal: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(20),
});

/**
 * Screening Companion: turns a person's browser-held assessment results into a
 * supportive, NON-diagnostic reflection plus tailored reads and routing.
 *
 * Stateless — we never persist or log the results themselves, only an event.
 */
export async function POST(req: Request) {
  const fp = clientFingerprint(req);
  const correlation = hashForCorrelation(fp);

  const rl = await rateLimit({ key: `${fp}:screening`, limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", detail: `Limit is ${RATE_LIMIT} reflections per 10 minutes.` },
      { status: 429 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  log.info("screening_reflection", {
    correlation,
    count: parsed.data.results.length,
    llm: isLlmConfigured(),
  });

  try {
    const reflection = await reflect(parsed.data.results);
    return NextResponse.json(reflection, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    log.error("screening_failed", { correlation, error: String((err as Error).message ?? err) });
    return NextResponse.json({ error: "reflection_failed" }, { status: 500 });
  }
}
