import { defineConfig, devices } from "@playwright/test"
import path from "path"

// End-to-end tests for the web app + the PWA viewport. Separate from the Vitest
// unit suite (src/**). Drives real headless Chromium against a running dev
// server (`npm run e2e`). Single worker keeps an older dev machine usable.
//
// Projects:
//   setup   - logs in once, saves the API-owned session (needs `npm run e2e:seed` first)
//   desktop – unauthenticated smoke (login/register/redirect), Desktop Chrome
//   pwa     – same smoke at a Pixel-5 (PWA) viewport
//   authed  – authenticated flows (*.authed.spec.ts), reuse the saved session
const authFile = path.join(__dirname, "e2e", ".auth", "user.json")
const skipWebServer = process.env.E2E_SKIP_WEBSERVER === "true"

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    { name: "desktop", testMatch: /(smoke|account-email)\.spec\.ts$/, use: { ...devices["Desktop Chrome"] } },
    { name: "pwa", testMatch: /(smoke|account-email)\.spec\.ts$/, use: { ...devices["Pixel 5"] } },
    {
      name: "authed",
      testMatch: /\.authed\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: authFile },
    },
  ],
  webServer: skipWebServer ? undefined : [
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
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        LOSPOR_API_INTERNAL_URL: "http://localhost:3002",
        MOBILE_PWA_URL: "",
        E2E_DISABLE_MOBILE_REDIRECT: "true",
      },
    },
  ],
})
