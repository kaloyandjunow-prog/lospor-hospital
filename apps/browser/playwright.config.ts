import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  webServer: [
    {
      command: "npm --prefix ../lospor-api run dev",
      url: "http://127.0.0.1:3002/health/live",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        LOSPOR_DATABASE_URL: "http://127.0.0.1:3003",
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
