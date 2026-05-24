import { streamText } from "ai";
import { z } from "zod";
import { NextResponse } from "next/server";
import { chatModel, isLlmConfigured, providerLabel } from "@/lib/ai/llm";
import { buildSahaySystemPrompt, SAHAY_TEMPERATURE } from "@/lib/ai/sahay-prompt";
import { detectCrisis } from "@/lib/safety/guardrails";
import { clientFingerprint, rateLimit } from "@/lib/ratelimit";
import { log } from "@/lib/observability/logger";
import { hashForCorrelation } from "@/lib/observability/scrub";
import { recordCrisisEvents } from "@/lib/observability/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 40;
const RATE_WINDOW_MS = 10 * 60 * 1000;

const Body = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    }),
  ),
  locale: z.enum(["en", "hi", "hinglish"]).default("en"),
  mode: z.enum(["ephemeral", "encrypted", "vault"]).default("ephemeral"),
  region: z.enum(["IN", "US", "UK", "AE", "SG", "OTHER"]).default("IN"),
});

/**
 * Sahay chat endpoint.
 *
 * - 501 Not Implemented when ANTHROPIC_API_KEY is unset.
 * - Crisis pre-check on every turn; the system prompt receives the signal.
 * - Rate-limited per client fingerprint.
 * - Stateless. Persistence (encrypted/vault) is the client's responsibility
 *   and lives in localStorage. We do not log message content.
 */
export async function POST(req: Request) {
  const fp = clientFingerprint(req);
  const correlation = hashForCorrelation(fp);

  if (!isLlmConfigured()) {
    log.warn("companion_not_configured", { correlation });
    return NextResponse.json(
      {
        error: "not_configured",
        detail:
          "No LLM provider is configured. Set LLM_PROVIDER=groq, LLM_PROVIDER=anthropic, or LLM_PROVIDER=ollama and reload.",
      },
      { status: 501 },
    );
  }

  const rl = await rateLimit({
    key: `${fp}:companion`,
    limit: RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
  });
  if (!rl.ok) {
    log.warn("companion_rate_limited", { correlation, remaining: rl.remaining });
    return NextResponse.json(
      {
        error: "rate_limited",
        detail: `Limit is ${RATE_LIMIT} messages per 10 minutes.`,
      },
      { status: 429 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { messages, locale, mode, region } = parsed.data;

  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const crisisHits = detectCrisis(lastUser);
  if (crisisHits.length > 0) {
    log.info("companion_crisis_detected", { correlation, locale, region, hitCount: crisisHits.length });
    void recordCrisisEvents({
      surface: "companion",
      categories: crisisHits.map((h) => h.category),
      fingerprint: fp,
    });
  }
  log.info("companion_request", {
    correlation,
    msgs: messages.length,
    locale,
    mode,
    region,
  });

  const system = buildSahaySystemPrompt({
    locale,
    mode,
    region,
    crisisDetected: crisisHits.length > 0,
  });

  const result = streamText({
    model: chatModel(),
    system,
    messages,
    temperature: SAHAY_TEMPERATURE,
    maxTokens: 600,
  });

  return result.toDataStreamResponse({
    headers: {
      "Cache-Control": "no-store",
      "X-RateLimit-Remaining": String(rl.remaining),
      "X-Sahay-Mode": mode,
    },
  });
}

export async function GET() {
  return NextResponse.json({
    surface: "companion",
    rateLimit: { perWindow: RATE_LIMIT, windowMs: RATE_WINDOW_MS },
    configured: isLlmConfigured(),
    provider: providerLabel(),
    modes: ["ephemeral", "encrypted", "vault"] as const,
    locales: ["en", "hi", "hinglish"] as const,
  });
}
