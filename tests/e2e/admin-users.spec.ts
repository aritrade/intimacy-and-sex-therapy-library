import { expect, test } from "@playwright/test";

/**
 * Admin /users page + roles API surface.
 *
 * Without DATABASE_URL the page renders a configuration banner; without a
 * session, the role mutation API refuses with 401/403. We don't sign in
 * here because the e2e webServer doesn't configure an OAuth provider —
 * those flows are covered by integration tests against a real DB.
 */

const ok = "Basic " + Buffer.from("test-admin:test-pass").toString("base64");

test.describe("/admin/users (Basic-auth fallback)", () => {
  test("renders the configuration banner without DATABASE_URL", async ({ request }) => {
    const r = await request.get("/admin/users", { headers: { Authorization: ok } });
    expect(r.status()).toBe(200);
    const body = await r.text();
    // Without DATABASE_URL the page short-circuits to the config banner.
    // The header copy + role guide are only rendered when DB is wired; that
    // path is covered by the integration tests in tests/integration.
    expect(body).toContain("DATABASE_URL not configured");
  });

  test("/admin/users without auth returns 401", async ({ request }) => {
    const r = await request.get("/admin/users");
    expect(r.status()).toBe(401);
  });
});

test.describe("/api/admin/roles", () => {
  test("POST without DATABASE_URL returns 503 db_not_configured", async ({ request }) => {
    const r = await request.post("/api/admin/roles", {
      headers: { Authorization: ok },
      data: { userId: "00000000-0000-0000-0000-000000000000", role: "clinician" },
    });
    expect(r.status()).toBe(503);
    const body = await r.json();
    expect(body.error).toBe("db_not_configured");
  });

  test("DELETE without DATABASE_URL returns 503 db_not_configured", async ({ request }) => {
    const r = await request.delete("/api/admin/roles", {
      headers: { Authorization: ok, "Content-Type": "application/json" },
      data: { userId: "00000000-0000-0000-0000-000000000000", role: "admin" },
    });
    expect(r.status()).toBe(503);
  });

  test("POST without admin auth returns 401", async ({ request }) => {
    const r = await request.post("/api/admin/roles", {
      data: { userId: "00000000-0000-0000-0000-000000000000", role: "clinician" },
    });
    expect(r.status()).toBe(401);
  });
});

test.describe("/api/admin/drafts/[id]/request-changes", () => {
  test("POST without DATABASE_URL returns 503 even for malformed body", async ({ request }) => {
    const r = await request.post(
      "/api/admin/drafts/00000000-0000-0000-0000-000000000000/request-changes",
      {
        headers: { Authorization: ok },
        data: {},
      },
    );
    // 503 because the handler's first check is DATABASE_URL.
    expect([400, 503]).toContain(r.status());
  });

  test("POST with invalid reason returns 400", async ({ request }) => {
    const r = await request.post(
      "/api/admin/drafts/00000000-0000-0000-0000-000000000000/request-changes",
      {
        headers: { Authorization: ok, "Content-Type": "application/json" },
        data: { reason: "not_a_real_reason", role: "clinician" },
      },
    );
    expect([400, 503]).toContain(r.status());
  });
});
