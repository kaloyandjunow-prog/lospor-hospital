import { defineConfig, devices } from "@playwright/test"

process.env.LOSPOR_DEPLOYMENT_MODE ??= "hospital"
const skipWebServer = process.env.E2E_SKIP_WEBSERVER === "true"

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "../web/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  webServer: skipWebServer ? undefined : [
    {
      command: "npm --prefix ../api run dev",
      url: "http://127.0.0.1:3002/health/live",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
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
      command: "npm run dev",
      url: "http://127.0.0.1:3003/login",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        LOSPOR_API_INTERNAL_URL: "http://127.0.0.1:3002",
      },
    },
  ],
  use: {
    baseURL: "http://127.0.0.1:3003",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
})
