/**
 * Single source of truth for which LLM the runtime is using.
 *
 * Three providers are supported today:
 *   - "anthropic" — Claude Sonnet via @ai-sdk/anthropic. Needs ANTHROPIC_API_KEY.
 *   - "groq"      — Groq cloud (Llama / Gemma / Mixtral) via the OpenAI-
 *                   compatible endpoint at api.groq.com. Needs GROQ_API_KEY.
 *                   Default model is llama-3.3-70b-versatile (tool-capable).
 *   - "ollama"    — local Ollama server via `ollama-ai-provider`. Needs an
 *                   Ollama daemon listening on OLLAMA_HOST (default
 *                   http://localhost:11434).
 *
 * Selection precedence:
 *   1. LLM_PROVIDER env var (explicit operator choice).
 *   2. GROQ_API_KEY set                                -> groq.
 *   3. ANTHROPIC_API_KEY set                           -> anthropic.
 *   4. OLLAMA_HOST set OR daemon reachable on default  -> ollama.
 *   5. None                                            -> not configured.
 *
 * Routes (`/api/chat`, `/api/companion/chat`) call `isLlmConfigured()` to
 * gate the 501 refusal, then `chatModel()` to grab the actual model handle.
 *
 * No live network call here — `isLlmConfigured()` is a sync check on env.
 * The probe at /api/ready does the actual reachability test on startup.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider";
import type { LanguageModelV1 } from "@ai-sdk/provider";

export type LlmProvider = "anthropic" | "groq" | "ollama";

export const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

// Groq's OpenAI-compatible endpoint. We pin the URL because their host
// occasionally serves regional shards under different DNS, and this one is
// the documented stable entry point.
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

// Default to Llama 3.3 70B which DOES expose reliable tool-calling. If the
// operator picks a non-tool-capable model (gemma2-9b-it, deepseek, mixtral
// older builds, etc.) we automatically fall back to the inline-RAG path via
// `supportsTools()`.
export const GROQ_MODEL =
  process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

export const OLLAMA_HOST =
  process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

export const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL ?? "gemma4:latest";

export function activeProvider(): LlmProvider | null {
  const explicit = (process.env.LLM_PROVIDER ?? "").toLowerCase().trim();
  if (explicit === "anthropic") return "anthropic";
  if (explicit === "groq") return "groq";
  if (explicit === "ollama") return "ollama";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  // We don't probe here, but if OLLAMA_HOST is explicitly set we trust the
  // operator. The /api/ready probe will catch a misconfigured daemon.
  if (process.env.OLLAMA_HOST || process.env.OLLAMA_MODEL) return "ollama";
  return null;
}

/**
 * True if the active provider supports tool-calling reliably enough for
 * the AI SDK's `streamText({ tools })` path. Models that don't (Gemma,
 * older Mixtrals, all Ollama-hosted local models) get routed through
 * inline RAG instead, which pre-fetches context and bakes it into the
 * system prompt.
 *
 * The Groq tool-capability list is conservative — only the families we've
 * actually verified are returned as `true`.
 */
export function supportsTools(): boolean {
  const p = activeProvider();
  if (p === "anthropic") return true;
  if (p === "groq") {
    const m = GROQ_MODEL.toLowerCase();
    // Tool-calling has been stable for the Llama 3.x and Llama 4 families on
    // Groq. Gemma, Mixtral, DeepSeek, and the older Llama 2 builds either
    // don't support tools or emit malformed JSON when they do.
    return m.startsWith("llama-3") || m.startsWith("llama3") || m.startsWith("llama-4");
  }
  return false;
}

export function isLlmConfigured(): boolean {
  return activeProvider() !== null;
}

/**
 * Returns a Vercel AI SDK model handle for chat-style generation.
 * Throws if no provider is configured — callers must check
 * `isLlmConfigured()` first and return a 501 instead.
 */
export function chatModel(): LanguageModelV1 {
  const provider = activeProvider();
  if (provider === "anthropic") {
    return anthropic(ANTHROPIC_MODEL);
  }
  if (provider === "groq") {
    const groq = createOpenAI({
      baseURL: GROQ_BASE_URL,
      apiKey: process.env.GROQ_API_KEY,
      // Groq returns standard OpenAI-shape chat completions; no special
      // headers required. We give it a distinct name purely for log clarity.
      name: "groq",
    });
    return groq(GROQ_MODEL);
  }
  if (provider === "ollama") {
    const ollama = createOllama({ baseURL: `${OLLAMA_HOST}/api` });
    return ollama(OLLAMA_MODEL);
  }
  throw new Error(
    "No LLM provider configured. Set LLM_PROVIDER plus the matching key (GROQ_API_KEY, ANTHROPIC_API_KEY) or OLLAMA_HOST."
  );
}

/**
 * User-facing description of the active provider, used by the disabled
 * banner / status page. Never includes secrets.
 */
export function providerLabel(): string {
  const p = activeProvider();
  if (p === "anthropic") return `Anthropic · ${ANTHROPIC_MODEL}`;
  if (p === "groq") return `Groq · ${GROQ_MODEL}`;
  if (p === "ollama") return `Ollama · ${OLLAMA_MODEL} (${OLLAMA_HOST})`;
  return "not configured";
}
