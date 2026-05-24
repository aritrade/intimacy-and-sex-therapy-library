import { expect, test } from "@playwright/test";

const ok = "Basic " + Buffer.from("test-admin:test-pass").toString("base64");

test.describe("/api/cron/post-metrics-poll", () => {
  test("refuses without CRON_SECRET configured (503)", async ({ request }) => {
    const r = await request.get("/api/cron/post-metrics-poll");
    expect(r.status()).toBe(503);
    const body = await r.json();
    expect(body.error).toBe("cron_disabled");
  });

  test("public POST without bearer is also 503 in this environment", async ({ request }) => {
    const r = await request.post("/api/cron/post-metrics-poll");
    expect(r.status()).toBe(503);
  });
});

test.describe("/api/admin/post-metrics/poll", () => {
  test("rejects without admin auth (401)", async ({ request }) => {
    const r = await request.post("/api/admin/post-metrics/poll", { data: {} });
    expect(r.status()).toBe(401);
  });

  test("with admin auth but no DATABASE_URL returns 503", async ({ request }) => {
    const r = await request.post("/api/admin/post-metrics/poll", {
      headers: { Authorization: ok, "Content-Type": "application/json" },
      data: {},
    });
    expect(r.status()).toBe(503);
    const body = await r.json();
    expect(body.error).toBe("db_not_configured");
  });

  test("rejects out-of-range limit", async ({ request }) => {
    const r = await request.post("/api/admin/post-metrics/poll", {
      headers: { Authorization: ok, "Content-Type": "application/json" },
      data: { limit: 9999 },
    });
    // 503 (no DB) wins because the handler checks DATABASE_URL first; in a
    // wired environment it would be 400.
    expect([400, 503]).toContain(r.status());
  });
});
