import { afterEach, describe, expect, it, vi } from "vitest";
import { clientFingerprint, rateLimit } from "@/lib/ratelimit";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  // Restore env between tests so the limiter doesn't accidentally hit Upstash.
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env = { ...ORIGINAL_ENV };
});

describe("rateLimit (in-memory fallback)", () => {
  it("allows up to limit and blocks the next request", async () => {
    const key = `test:${Math.random()}`;
    const r1 = await rateLimit({ key, limit: 2, windowMs: 1000 });
    expect(r1.ok).toBe(true);
    expect(r1.remaining).toBe(1);
    const r2 = await rateLimit({ key, limit: 2, windowMs: 1000 });
    expect(r2.ok).toBe(true);
    expect(r2.remaining).toBe(0);
    const r3 = await rateLimit({ key, limit: 2, windowMs: 1000 });
    expect(r3.ok).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("resets after the window elapses", async () => {
    vi.useFakeTimers();
    const key = `test-window:${Math.random()}`;
    const r1 = await rateLimit({ key, limit: 1, windowMs: 100 });
    expect(r1.ok).toBe(true);
    const r2 = await rateLimit({ key, limit: 1, windowMs: 100 });
    expect(r2.ok).toBe(false);
    vi.advanceTimersByTime(150);
    const r3 = await rateLimit({ key, limit: 1, windowMs: 100 });
    expect(r3.ok).toBe(true);
    vi.useRealTimers();
  });

  it("scopes by key — different keys do not consume each other's budget", async () => {
    const a = await rateLimit({ key: `keyA:${Math.random()}`, limit: 1, windowMs: 1000 });
    const b = await rateLimit({ key: `keyB:${Math.random()}`, limit: 1, windowMs: 1000 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });
});

describe("clientFingerprint", () => {
  it("uses x-forwarded-for first hop when present", () => {
    const req = new Request("https://example.test", {
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
    });
    expect(clientFingerprint(req)).toBe("chat:1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("https://example.test", {
      headers: { "x-real-ip": "5.6.7.8" },
    });
    expect(clientFingerprint(req)).toBe("chat:5.6.7.8");
  });

  it("falls back to anon when no IP headers are present", () => {
    expect(clientFingerprint(new Request("https://example.test"))).toBe("chat:anon");
  });
});
