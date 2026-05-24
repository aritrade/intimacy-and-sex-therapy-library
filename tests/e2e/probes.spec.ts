import { expect, test } from "@playwright/test";

test.describe("ops probes", () => {
  test("/api/ready returns 200 with timestamp", async ({ request }) => {
    const r = await request.get("/api/ready");
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.ok).toBe(true);
    expect(typeof body.ts).toBe("string");
  });

  test("/api/health is 503 with per-subsystem detail when DB+LLM unset", async ({ request }) => {
    const r = await request.get("/api/health");
    expect(r.status()).toBe(503);
    const body = await r.json();
    expect(body.ok).toBe(false);
    expect(body.subsystems.db.ok).toBe(false);
    expect(body.subsystems.kms.ok).toBe(true); // local KMS is wired in webServer env
    expect(body.subsystems.llm.ok).toBe(false);
    expect(body.subsystems.embed.ok).toBe(false);
    expect(body.subsystems.db.detail).toContain("DATABASE_URL");
  });

  test("/api/health responses are not cacheable", async ({ request }) => {
    const r = await request.get("/api/health");
    const cc = r.headers()["cache-control"] ?? "";
    expect(cc.toLowerCase()).toContain("no-store");
  });
});

test.describe("SEO surface", () => {
  test("/robots.txt disallows the sensitive surfaces", async ({ request }) => {
    const r = await request.get("/robots.txt");
    expect(r.status()).toBe(200);
    const text = await r.text();
    for (const path of ["/companion", "/chat", "/account", "/admin", "/api/"]) {
      expect(text).toContain(`Disallow: ${path}`);
    }
  });

  test("/sitemap.xml lists public pages and excludes sensitive ones", async ({ request }) => {
    const r = await request.get("/sitemap.xml");
    expect(r.status()).toBe(200);
    const text = await r.text();
    for (const must of ["/catalog", "/library", "/paths", "/about/privacy"]) {
      expect(text).toContain(must);
    }
    for (const mustNot of ["/companion", "/chat", "/account", "/admin"]) {
      expect(text).not.toContain(`<loc>${process.env.NEXT_PUBLIC_SITE_URL ?? ""}${mustNot}</loc>`);
    }
  });
});

test.describe("security headers", () => {
  test("global response has CSP, HSTS, X-Frame-Options, Referrer-Policy", async ({ request }) => {
    const r = await request.get("/");
    expect(r.status()).toBe(200);
    const h = r.headers();
    expect(h["content-security-policy"]).toBeTruthy();
    expect(h["strict-transport-security"]).toContain("max-age");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toContain("strict-origin");
    expect(h["permissions-policy"]).toContain("camera=()");
  });

  test("/companion has a tighter CSP with no third-party connect-src", async ({ request }) => {
    const r = await request.get("/companion");
    const csp = r.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toMatch(/connect-src[^;]*plausible/);
  });
});
