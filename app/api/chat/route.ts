import { streamText, tool } from "ai";
import { z } from "zod";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  chatModel,
  isLlmConfigured,
  providerLabel,
  supportsTools,
} from "@/lib/ai/llm";
import {
  buildCitationSystemPrompt,
  CITATION_TEMPERATURE,
} from "@/lib/ai/system-prompt";
import { hybridRetrieve } from "@/lib/search/hybrid";
import { buildContextBlock, corpusRetrieve } from "@/lib/search/corpus";
import { detectCrisis } from "@/lib/safety/guardrails";
import { clientFingerprint, rateLimit } from "@/lib/ratelimit";
import { db } from "@/lib/db/client";
import { resources } from "@/lib/db/schema";
import { log } from "@/lib/observability/logger";
import { hashForCorrelation } from "@/lib/observability/scrub";
import { recordCrisisEvents } from "@/lib/observability/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;

const Body = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    }),
  ),
  scopedResourceId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const fp = clientFingerprint(req);
  const correlation = hashForCorrelation(fp);

  if (!isLlmConfigured()) {
    log.warn("chat_not_configured", { correlation });
    return NextResponse.json(
      {
        error: "not_configured",
        detail:
          "No LLM provider is configured. Set LLM_PROVIDER=groq with GROQ_API_KEY (cloud, free tier, recommended for hosted deploys), LLM_PROVIDER=anthropic with ANTHROPIC_API_KEY, or LLM_PROVIDER=ollama with OLLAMA_HOST pointing at a reachable Ollama daemon.",
      },
      { status: 501 },
    );
  }

  const rl = await rateLimit({ key: fp, limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS });
  if (!rl.ok) {
    log.warn("chat_rate_limited", { correlation, remaining: rl.remaining });
    return NextResponse.json(
      {
        error: "rate_limited",
        detail: `Limit is ${RATE_LIMIT} messages per 10 minutes. Try again at ${new Date(rl.resetAt).toISOString()}.`,
      },
      { status: 429 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { messages, scopedResourceId } = parsed.data;

  // Crisis pre-check — content-free logging.
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const crisisHits = detectCrisis(lastUser);
  if (crisisHits.length > 0) {
    log.info("chat_crisis_detected", { correlation, hitCount: crisisHits.length });
    void recordCrisisEvents({
      surface: "chat",
      categories: crisisHits.map((h) => h.category),
      fingerprint: fp,
    });
  }

  // Resolve scope title for the system prompt.
  let scopedResourceTitle: string | undefined;
  if (scopedResourceId && process.env.DATABASE_URL) {
    const row = await db
      .select({ title: resources.title })
      .from(resources)
      .where(eq(resources.id, scopedResourceId))
      .limit(1);
    scopedResourceTitle = row[0]?.title;
  }

  const useTools = supportsTools();
  log.info("chat_request", {
    correlation,
    msgs: messages.length,
    scoped: scopedResourceId ? "yes" : "no",
    mode: useTools ? "tools" : "inline_rag",
  });

  const baseSystem =
    buildCitationSystemPrompt({ scopedResourceTitle }) +
    (crisisHits.length > 0
      ? "\n\nCRISIS SIGNAL DETECTED: the user's last message tripped a crisis-keyword check. Acknowledge them first, then surface the local crisis resources before any other content."
      : "");

  // ---------------------------------------------------------------------------
  // Path A: provider supports tools (Anthropic) — keep the tool-calling flow
  // so the model can decide query reformulation / multi-step lookups.
  // ---------------------------------------------------------------------------
  if (useTools) {
    const result = streamText({
      model: chatModel(),
      system: baseSystem,
      messages,
      temperature: CITATION_TEMPERATURE,
      maxSteps: 4,
      tools: {
        searchCorpus: tool({
          description:
            "Search the curated, allowlisted sex-therapy corpus. Always call this before answering a substantive question.",
          parameters: z.object({
            query: z.string(),
            topK: z.number().int().min(1).max(12).default(8),
          }),
          execute: async ({ query, topK }) => {
            const hits = await hybridRetrieve({ query, topK, scopedResourceId });
            return hits.map((h, i) => ({
              n: i + 1,
              title: h.resourceTitle,
              authors: h.authors,
              year: h.publishedYear,
              source: h.sourceName,
              url: h.externalUrl,
              page: h.pageNum ?? null,
              timestamp: h.timestampSeconds ?? null,
              slug: h.resourceSlug,
              snippet: h.content.slice(0, 1200),
              matchedBy: h.matchedBy,
            }));
          },
        }),
      },
    });
    return result.toDataStreamResponse({
      headers: {
        "Cache-Control": "no-store",
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-Chat-Mode": "tools",
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Path B: provider does NOT support tools reliably (Ollama / Gemma / Llama).
  // We do RAG inline: pre-fetch from the corpus on the user's last message,
  // bake the numbered context into the system prompt, and let the model write
  // a citation-style answer over it.
  // ---------------------------------------------------------------------------
  const hits = await corpusRetrieve({
    query: lastUser || "sex therapy overview",
    topK: 6,
    scopedResourceId,
  });
  const contextBlock = buildContextBlock(hits);

  const inlineSystem = `${baseSystem}

CONTEXT FROM THE LIBRARY (use ONLY these passages to ground your answer):

${contextBlock}

INSTRUCTIONS FOR THIS REPLY
- Answer the user's question in 4–8 sentences using only the passages above.
- Cite inline as [1], [2], etc. matching the numbers in the context.
- If the context is insufficient, say "The library doesn't have a clear answer to this." and stop.
- End with a "Sources" section listing every cited entry as: [n] Title — Authors (Year) — Source name — URL.
${
  hits.length > 0
    ? `\nSOURCES YOU MAY CITE:\n${hits
        .map(
          (h, i) =>
            `[${i + 1}] ${h.resourceTitle} — ${(h.authors ?? []).slice(0, 3).join(", ") || "Institutional"} (${h.year ?? "n.d."}) — ${h.sourceName} — ${h.externalUrl}`
        )
        .join("\n")}`
    : ""
}`;

  const result = streamText({
    model: chatModel(),
    system: inlineSystem,
    messages,
    temperature: CITATION_TEMPERATURE,
    maxTokens: 700,
  });

  return result.toDataStreamResponse({
    headers: {
      "Cache-Control": "no-store",
      "X-RateLimit-Remaining": String(rl.remaining),
      "X-Chat-Mode": "inline_rag",
      "X-Chat-Hits": String(hits.length),
    },
  });
}

export async function GET() {
  return NextResponse.json({
    surface: "chat",
    rateLimit: { perWindow: RATE_LIMIT, windowMs: RATE_WINDOW_MS },
    configured: isLlmConfigured(),
    provider: providerLabel(),
    mode: supportsTools() ? "tools" : "inline_rag",
  });
}
