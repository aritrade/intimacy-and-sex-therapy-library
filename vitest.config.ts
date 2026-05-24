import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config for the unit/integration test suite.
 *
 * - Runs only `tests/unit/**` and `tests/integration/**`. Playwright owns
 *   `tests/e2e/**` (separate config in playwright.config.ts).
 * - Resolves `@/` to the project root, matching tsconfig.
 * - Loads `.env.test` if present, so integration tests can pin a Postgres
 *   service URL without leaking into dev.
 */
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: [
      "tests/e2e/**",
      "node_modules/**",
      ".next/**",
      // Helper module — imported by specs, not a spec itself.
      "tests/integration/_db.ts",
    ],
    environment: "node",
    globals: false,
    reporters: ["default"],
    setupFiles: ["tests/setup/env.ts"],
    // Integration specs share a single DB pool; we serialise files via
    // `fileParallelism: false` so ad-hoc cleanup between specs is
    // deterministic. Unit tests are tiny and don't pay for this.
    fileParallelism: false,
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: [
        "lib/db/schema.ts",
        "lib/db/migrate.ts",
        "lib/auth/**",
        "lib/i18n/**",
      ],
      reporter: ["text", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
