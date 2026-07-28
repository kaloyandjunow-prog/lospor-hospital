import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PWA_E2E_BASE_URL ?? "http://localhost:3001",
    ...devices["Pixel 5"],
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm --prefix ../lospor-api run dev",
      url: "http://localhost:3002/health/live",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        LOSPOR_WEB_URL: "http://localhost:3000",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        AUTH_EMAIL_TEST_LINKS: "true",
        BREVO_API_KEY: "",
      },
    },
    {
      command: "node scripts/serve-pwa.mjs",
      url: "http://localhost:3001",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
