import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config.
 *
 * - Builds once and serves the production bundle on port 3100.
 * - Pins KMS_LOCAL_MASTER_KEY so /api/health KMS subsystem is healthy.
 * - Does NOT set DATABASE_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY — the
 *   suite asserts the platform's "graceful refusal" path explicitly.
 *
 * Locally:
 *   npx playwright install chromium
 *   npx next build
 *   npm run test:e2e
 *
 * The `webServer` block lets `playwright test` boot the server itself.
 * In CI we usually start it separately so the build step can be cached.
 */

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

const TEST_KMS_KEY = Buffer.alloc(32, 7).toString("base64");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5000 },
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `${BASE_URL}/api/ready`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        env: {
          PORT: String(PORT),
          NODE_ENV: "production",
          KMS_PROVIDER: "local",
          KMS_LOCAL_MASTER_KEY: TEST_KMS_KEY,
          NEXT_PUBLIC_SITE_URL: BASE_URL,
          ADMIN_BASIC_USER: "test-admin",
          ADMIN_BASIC_PASS: "test-pass",
          // Auth.js reads AUTH_SECRET in the middleware even without providers
          // configured; pin it to silence "[auth][error] MissingSecret" log noise.
          AUTH_SECRET: TEST_KMS_KEY,
          LOG_LEVEL: "silent",
        },
      },
});
