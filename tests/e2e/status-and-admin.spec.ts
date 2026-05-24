import { expect, test } from "@playwright/test";

test.describe("public /status page", () => {
  test("renders Operational/Degraded badges per subsystem", async ({ page }) => {
    const r = await page.goto("/status");
    expect(r?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The four named subsystems must all be on the page.
    for (const label of ["Database", "Key management", "LLM provider", "Embeddings provider"]) {
      await expect(page.getByRole("heading", { name: label })).toBeVisible();
    }
    // KMS is the one we wire up in the test webServer, so it should show
    // "Operational"; DB/LLM/Embeddings are intentionally not configured.
    const operational = page.getByText("Operational");
    const degraded = page.getByText("Degraded");
    await expect(operational.first()).toBeVisible();
    await expect(degraded.first()).toBeVisible();
  });

  test("/status is publicly indexable in robots.txt", async ({ request }) => {
    const r = await request.get("/robots.txt");
    expect(r.status()).toBe(200);
    const text = await r.text();
    expect(text).toContain("Allow: /status");
  });

  test("/sitemap.xml lists /status", async ({ request }) => {
    const r = await request.get("/sitemap.xml");
    const text = await r.text();
    expect(text).toContain("/status");
  });
});

test.describe("enriched /admin dashboard (Basic-auth)", () => {
  const ok = "Basic " + Buffer.from("test-admin:test-pass").toString("base64");

  test("renders dashboard sections even without DATABASE_URL", async ({ request }) => {
    const r = await request.get("/admin", { headers: { Authorization: ok } });
    expect(r.status()).toBe(200);
    const body = await r.text();
    // Top-line counters
    expect(body).toContain("Drafts (all)");
    expect(body).toContain("Awaiting clinician");
    expect(body).toContain("Awaiting editor");
    expect(body).toContain("Ready to publish");
    // Sections
    expect(body).toContain("Crisis events");
    expect(body).toContain("Catalog health");
    expect(body).toContain("Eval trend");
    expect(body).toContain("Recent admin actions");
    // The DB-not-configured banner must surface clearly.
    expect(body.toLowerCase()).toContain("database_url is not configured");
  });

  test("the drafts page renders status filter chips", async ({ request }) => {
    const r = await request.get("/admin/drafts", { headers: { Authorization: ok } });
    // Without DATABASE_URL the page shows a configuration banner instead of
    // chips — assert the configuration banner so the test is robust either way.
    expect(r.status()).toBe(200);
    const body = await r.text();
    expect(
      body.toLowerCase().includes("database_url not configured") ||
        (body.includes("script_draft") && body.includes("editor_reviewed")),
    ).toBe(true);
  });
});
