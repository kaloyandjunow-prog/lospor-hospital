import { defineConfig, devices } from "@playwright/test"

/** Screenshot-only capture against the already-running dev web/API/PWA servers. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 1_800_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "overflow-screenshots",
      testMatch: /intraop-list-screens\.crossapp\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
