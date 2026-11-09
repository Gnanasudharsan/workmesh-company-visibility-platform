import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the real stack: Next.js (3002) + NestJS API (8020) +
 * PostgreSQL + Redis. Global setup reseeds the synthetic demo tenants first.
 * Locally, already-running dev servers are reused.
 */
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3002",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: "corepack pnpm --filter @workmesh/api start",
      url: "http://localhost:8020/api/health",
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: "ignore",
    },
    {
      command: CI ? "corepack pnpm --filter @workmesh/web start" : "corepack pnpm --filter @workmesh/web dev",
      url: "http://localhost:3002/login",
      reuseExistingServer: !CI,
      timeout: 180_000,
      stdout: "ignore",
    },
  ],
});
