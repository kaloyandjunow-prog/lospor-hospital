import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "../web/e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PWA_E2E_BASE_URL ?? "http://localhost:3001/app/",
    ...devices["Pixel 5"],
    // Capability/auth contract specs intercept these requests; a registered
    // service worker would otherwise bypass Playwright's page routing.
    serviceWorkers: "block",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm --prefix ../api run dev",
      url: "http://localhost:3002/health/live",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        LOSPOR_WEB_URL: "http://localhost:3000",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        AUTH_EMAIL_TEST_LINKS: "true",
        BREVO_API_KEY: "",
        DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://lospor:lospor-e2e@127.0.0.1:55433/lospor_e2e",
        DIRECT_URL: process.env.E2E_DATABASE_URL ?? "postgresql://lospor:lospor-e2e@127.0.0.1:55433/lospor_e2e",
        LOSPOR_DEPLOYMENT_MODE: "hospital",
        LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED: "true",
        LOSPOR_AUTH_SECRET: "e2e-only-auth-secret-not-for-production-2026",
        NEXTAUTH_SECRET: "e2e-only-auth-secret-not-for-production-2026",
        HOSPITAL_PATIENT_HMAC_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        HOSPITAL_PATIENT_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        HOSPITAL_EXPORT_PSEUDONYM_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        HOSPITAL_REQUIRE_PATIENT_NUMBER: "true",
        OMOP_PSEUDONYM_SALT: "e2e-only-pseudonym-salt",
        LOSPOR_DISABLE_RATE_LIMIT: "true",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
    {
      command: "node scripts/serve-pwa.mjs",
      url: "http://localhost:3001",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        PWA_API_PROXY_TARGET: "http://localhost:3002",
      },
    },
  ],
})
