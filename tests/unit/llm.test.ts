import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `lib/ai/llm` resolves several constants at module-load time
// (GROQ_MODEL, OLLAMA_MODEL, ANTHROPIC_MODEL). We must reset the module
// cache between tests so each fresh import picks up the env we just set.
async function freshLlmModule() {
  vi.resetModules();
  return await import("../../lib/ai/llm");
}

const ORIGINAL = { ...process.env };

beforeEach(() => {
  delete process.env.LLM_PROVIDER;
  delete process.env.GROQ_API_KEY;
  delete process.env.GROQ_MODEL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
  delete process.env.OLLAMA_HOST;
  delete process.env.OLLAMA_MODEL;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("activeProvider precedence", () => {
  it("returns null when nothing is configured", async () => {
    const { activeProvider, isLlmConfigured } = await freshLlmModule();
    expect(activeProvider()).toBeNull();
    expect(isLlmConfigured()).toBe(false);
  });

  it("honours an explicit LLM_PROVIDER override even if a different key is set", async () => {
    process.env.LLM_PROVIDER = "groq";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const { activeProvider } = await freshLlmModule();
    expect(activeProvider()).toBe("groq");
  });

  it("falls through to GROQ_API_KEY when LLM_PROVIDER is empty", async () => {
    process.env.GROQ_API_KEY = "gsk_test";
    const { activeProvider } = await freshLlmModule();
    expect(activeProvider()).toBe("groq");
  });

  it("prefers groq over anthropic when both keys are set", async () => {
    process.env.GROQ_API_KEY = "gsk_test";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const { activeProvider } = await freshLlmModule();
    expect(activeProvider()).toBe("groq");
  });

  it("falls back to anthropic when only ANTHROPIC_API_KEY is set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const { activeProvider } = await freshLlmModule();
    expect(activeProvider()).toBe("anthropic");
  });

  it("falls back to ollama when only OLLAMA_HOST is set", async () => {
    process.env.OLLAMA_HOST = "http://localhost:11434";
    const { activeProvider } = await freshLlmModule();
    expect(activeProvider()).toBe("ollama");
  });
});

describe("supportsTools", () => {
  it("returns true for anthropic", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const { supportsTools } = await freshLlmModule();
    expect(supportsTools()).toBe(true);
  });

  it("returns true for groq with the default Llama 3.3 model", async () => {
    process.env.GROQ_API_KEY = "gsk_test";
    // GROQ_MODEL falls back to the default llama-3.3-70b-versatile.
    const { supportsTools } = await freshLlmModule();
    expect(supportsTools()).toBe(true);
  });

  it("returns false for groq when the operator picked Gemma", async () => {
    process.env.GROQ_API_KEY = "gsk_test";
    process.env.GROQ_MODEL = "gemma2-9b-it";
    const { supportsTools } = await freshLlmModule();
    expect(supportsTools()).toBe(false);
  });

  it("returns false for ollama (local models emit malformed tool JSON)", async () => {
    process.env.OLLAMA_HOST = "http://localhost:11434";
    const { supportsTools } = await freshLlmModule();
    expect(supportsTools()).toBe(false);
  });
});

describe("providerLabel", () => {
  it("never includes the secret value", async () => {
    process.env.GROQ_API_KEY = "gsk_super_secret_token_should_not_leak";
    process.env.GROQ_MODEL = "llama-3.3-70b-versatile";
    const { providerLabel } = await freshLlmModule();
    const label = providerLabel();
    expect(label).toContain("Groq");
    expect(label).toContain("llama-3.3-70b-versatile");
    expect(label).not.toContain("gsk_super_secret_token_should_not_leak");
  });

  it("returns 'not configured' when no provider is set", async () => {
    const { providerLabel } = await freshLlmModule();
    expect(providerLabel()).toBe("not configured");
  });
});
