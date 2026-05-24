/**
 * Thin wrapper around @ai-sdk/anthropic so the rest of the codebase has a
 * single place to read the model name from env.
 *
 * Anthropic model identifiers change over time. We pin via env so an operator
 * can swap to a newer Sonnet point-release without code changes.
 */

import { anthropic } from "@ai-sdk/anthropic";

export const CLAUDE_GENERATION_MODEL =
  process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

export function claudeModel() {
  return anthropic(CLAUDE_GENERATION_MODEL);
}

export function isAnthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
