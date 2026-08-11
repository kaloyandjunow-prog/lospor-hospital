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

// The suite runs against a disposable local PostgreSQL, not the shared dev
// project. See e2e/docker-compose.e2e.yaml: the seeder is not transactional and
// has a path that cannot repair itself on a rerun, which against a shared
// database made every run something to be careful about. Here the recovery for
// anything is `npm run e2e:db:reset`.
//
// Set E2E_DATABASE_URL to point somewhere else deliberately.
const e2eDatabaseUrl = process.env.E2E_DATABASE_URL
  ?? "postgresql://lospor:lospor-e2e@127.0.0.1:55433/lospor_e2e"

export default defineConfig({
  testDir: "./e2e",
  // Reseeds first, which also clears the login rate-limit buckets the suite
  // would otherwise exhaust on itself. See e2e/global-setup.ts.
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  // Single worker. Not a hardware limitation any more — measured on a 6-core /
  // 32 GB machine, 9 Aug 2026, 57 tests, reseeding before each run:
  //
  //   workers:1                    128 s   0 failures
  //   workers:2                     79 s   1-3 failures
  //   workers:4                     62 s   1-3 failures
  //   workers:4 + fullyParallel     63 s   3-4 failures
  //
  // Parallelism is genuinely ~2x faster and genuinely unsafe here: the specs
  // share one database and one set of seeded accounts, and the flake lands on
  // offline-sync (which manipulates network state), case-visibility, the
  // server-rendered PDF, and case creation itself — concurrent creates for one
  // user can exhaust the caseCode retry budget and 500.
  //
  // A suite that cries wolf once or twice a run trains people to skim past
  // failures, which is how a real regression ships. 66 seconds does not buy that.
  //
  // To make this parallel-safe properly, give each worker its own seeded user
  // (worker-scoped fixtures) so no two specs contend for the same account or
  // case list — then raise workers. Do not simply turn this number up.
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
        DATABASE_URL: e2eDatabaseUrl,
        DIRECT_URL: e2eDatabaseUrl,
        // The suite signs in more than a dozen times from one address against a
        // limit of ten per fifteen minutes, so it exhausts a control it imposed
        // on itself. The API refuses this flag on a production build, on any
        // Vercel deployment, and against the production project — see
        // rateLimitingDisabledForTests.
        LOSPOR_DISABLE_RATE_LIMIT: "true",
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
