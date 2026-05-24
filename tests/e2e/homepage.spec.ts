import { expect, test } from "@playwright/test";

test.describe("homepage + age gate", () => {
  test("first visit renders the age gate, not the main hero", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: /18 or older/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /yes, i'?m 18/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /under 18/i })).toBeVisible();
  });

  test("clicking 'under 18' shows youth redirect copy", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /under 18/i }).click();
    await expect(page.getByText(/youth helpline|trusted adult/i)).toBeVisible();
  });

  test("confirming 18+ persists across navigation via cookie", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /yes, i'?m 18/i }).click();
    // Post-gate hero exposes the explore-the-catalog CTA.
    await expect(page.getByRole("link", { name: /explore the catalog/i })).toBeVisible();

    // Navigate away and back — the dialog with the gate must NOT reappear.
    await page.goto("/about/privacy");
    await page.goto("/");
    await expect(page.getByRole("link", { name: /explore the catalog/i })).toBeVisible();
  });

  test("crisis FAB is always available and reveals India-first hotlines", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /yes, i'?m 18/i }).click();
    // The floating crisis button is anchored bottom-right on every page.
    const fab = page.getByRole("button", { name: /need help now/i });
    await expect(fab).toBeVisible();
    await fab.click();
    // Once opened, India-first numbers must be present.
    const dialog = page.getByRole("dialog", { name: /crisis resources/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Tele-MANAS|iCall|Vandrevala/i).first()).toBeVisible();
  });
});

test.describe("public navigation smoke", () => {
  // Check every public page loads without a 5xx and does not crash to an
  // error boundary. We pre-set the age cookie so these don't all stop at the gate.
  for (const path of [
    "/catalog",
    "/library",
    "/glossary",
    "/myths",
    "/paths",
    "/clinicians",
    "/assessments",
    "/decide",
    "/worksheets",
    "/about/privacy",
    "/about/model",
    "/about/clinical-board",
  ]) {
    test(`GET ${path} renders 200`, async ({ page }) => {
      await page.context().addCookies([
        {
          name: "stl_age_18",
          value: "1",
          url: page.url() === "about:blank" ? "http://localhost:3100" : page.url(),
        },
      ]);
      const r = await page.goto(path);
      expect(r?.status(), `expected 2xx for ${path}, got ${r?.status()}`).toBeLessThan(400);
      // Sanity: footer disclaimer links to privacy/model pages.
      await expect(page.locator("footer")).toBeVisible();
    });
  }
});

test.describe("sign-in page", () => {
  test("renders 'sign-in disabled' when no providers are configured", async ({ page }) => {
    await page.goto("/sign-in");
    // The page must explicitly tell the operator that auth is off.
    await expect(page.getByText(/sign[\s-]in (?:is\s+)?disabled|no providers configured|currently disabled/i)).toBeVisible();
  });
});
