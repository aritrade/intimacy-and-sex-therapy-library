import { expect, test } from "@playwright/test";

/**
 * The platform's "graceful refusal" contract:
 *
 *   - With no ANTHROPIC_API_KEY, /api/chat and /api/companion/chat MUST
 *     return 501 with a clear `not_configured` error — never crash, never
 *     leak environment hints.
 *   - With invalid bodies, they MUST return 400 with `invalid_body`.
 *   - The admin gate MUST return 401 (Basic-auth challenge) before any
 *     handler runs, even when the request body is well-formed.
 */

test.describe("/api/chat refusal posture", () => {
  test("GET surface metadata reports configured=false", async ({ request }) => {
    const r = await request.get("/api/chat");
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.surface).toBe("chat");
    expect(body.configured).toBe(false);
    expect(body.rateLimit.perWindow).toBeGreaterThan(0);
  });

  test("POST without API key returns 501 not_configured", async ({ request }) => {
    const r = await request.post("/api/chat", {
      data: { messages: [{ role: "user", content: "hello" }] },
    });
    expect(r.status()).toBe(501);
    const body = await r.json();
    expect(body.error).toBe("not_configured");
    expect(body.detail).toContain("ANTHROPIC_API_KEY");
  });
});

test.describe("/api/companion/chat refusal posture", () => {
  test("GET reports modes + locales + configured=false", async ({ request }) => {
    const r = await request.get("/api/companion/chat");
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.surface).toBe("companion");
    expect(body.configured).toBe(false);
    expect(body.modes).toContain("ephemeral");
    expect(body.modes).toContain("encrypted");
    expect(body.modes).toContain("vault");
    expect(body.locales).toContain("hi");
    expect(body.locales).toContain("hinglish");
  });

  test("POST without API key returns 501 not_configured", async ({ request }) => {
    const r = await request.post("/api/companion/chat", {
      data: {
        messages: [{ role: "user", content: "ok" }],
        locale: "en",
        mode: "ephemeral",
        region: "IN",
      },
    });
    expect(r.status()).toBe(501);
    const body = await r.json();
    expect(body.error).toBe("not_configured");
  });
});

test.describe("admin gate", () => {
  test("/admin without credentials returns 401 with WWW-Authenticate", async ({ request }) => {
    const r = await request.get("/admin", { headers: {} });
    expect(r.status()).toBe(401);
    expect(r.headers()["www-authenticate"]).toContain("Basic");
  });

  test("/api/admin/drafts without credentials returns 401", async ({ request }) => {
    const r = await request.get("/api/admin/drafts");
    expect(r.status()).toBe(401);
  });

  test("/admin with bad credentials returns 401", async ({ request }) => {
    const bad = "Basic " + Buffer.from("nope:nope").toString("base64");
    const r = await request.get("/admin", { headers: { Authorization: bad } });
    expect(r.status()).toBe(401);
  });

  test("/admin with the configured Basic credentials returns 200", async ({ request }) => {
    const ok = "Basic " + Buffer.from("test-admin:test-pass").toString("base64");
    const r = await request.get("/admin", { headers: { Authorization: ok } });
    // 200 if the page rendered. (It is a server component that doesn't need a DB.)
    expect(r.status()).toBe(200);
  });
});

test.describe("account API gates", () => {
  test("/api/account/forget without auth returns 401 (no DB needed to reach the gate)", async ({
    request,
  }) => {
    const r = await request.delete("/api/account/forget");
    // The route requires a session; without one, expect 401 (or 403). Both are
    // acceptable refusals, but never 5xx.
    expect([401, 403]).toContain(r.status());
  });
});
