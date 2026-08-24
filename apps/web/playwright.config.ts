import { defineConfig, devices } from "@playwright/test"
import path from "path"
import { cloudLegalDocumentsJson } from "./e2e/legal-documents"

// End-to-end tests for the Web app at desktop and mobile-Web viewports. The
// Expo PWA has its own config and suite under apps/pwa; a narrow browser width
// here is not PWA coverage. Separate from the Vitest
// unit suite (src/**). Drives real headless Chromium against a running dev
// server (`npm run e2e`). Single worker keeps an older dev machine usable.
//
// Projects:
//   setup   - logs in once, saves the API-owned session (needs `npm run e2e:seed` first)
//   desktop – unauthenticated smoke (login/register/redirect), Desktop Chrome
//   mobile-web – same smoke at a Pixel-5 Web viewport
//   authed  – authenticated flows (*.authed.spec.ts), reuse the saved session
const authFile = path.join(__dirname, "e2e", ".auth", "user.json")
const accountControlTokenFile = path.join(
  __dirname,
  "e2e",
  "fixtures",
  "status-account-control-token",
)
const skipWebServer = process.env.E2E_SKIP_WEBSERVER === "true"

function e2ePort(name: "E2E_WEB_PORT" | "E2E_API_PORT", fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a TCP port number`)
  const port = Number(raw)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be between 1 and 65535`)
  }
  return port
}

// Do not borrow the public demo's ordinary :3000/:3002 development servers.
// They deliberately have different registration and Hospital-route behaviour,
// so reusing one would produce convincing but meaningless appliance failures.
const e2eWebPort = e2ePort("E2E_WEB_PORT", 3300)
const e2eApiPort = e2ePort("E2E_API_PORT", 3302)
const e2eWebBaseUrl = process.env.E2E_BASE_URL ?? `http://localhost:${e2eWebPort}`
const e2eApiInternalUrl = process.env.E2E_API_INTERNAL_URL ?? `http://127.0.0.1:${e2eApiPort}`
// Role-aware contexts and smoke helpers run in Playwright workers rather than
// in either webServer child. Give those workers the same resolved endpoints.
process.env.E2E_BASE_URL ??= e2eWebBaseUrl
process.env.E2E_API_BASE ??= e2eApiInternalUrl
process.env.LOSPOR_API_INTERNAL_URL ??= e2eApiInternalUrl

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
  // printable-record flow, and case creation itself — concurrent creates for one
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
    baseURL: e2eWebBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    { name: "desktop", testMatch: /(smoke|account-email)\.spec\.ts$/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-web", testMatch: /(smoke|account-email)\.spec\.ts$/, use: { ...devices["Pixel 5"] } },
    {
      name: "authed",
      testMatch: /\.authed\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: authFile },
    },
  ],
  webServer: skipWebServer ? undefined : [
    {
      command: `npm exec -- next dev --port ${e2eApiPort}`,
      cwd: "../api",
      url: `${e2eApiInternalUrl}/health/live`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        LOSPOR_WEB_URL: e2eWebBaseUrl,
        NEXT_PUBLIC_APP_URL: e2eWebBaseUrl,
        AUTH_EMAIL_TEST_LINKS: "true",
        BREVO_API_KEY: "",
        // Registration is an acceptance of named, checksummed documents since
        // 1.2.0, and the API refuses to serve GET /v1/legal/documents — and so
        // refuses to register anybody — until it is told what those documents
        // say. Generated from the messages this app actually renders rather
        // than pinned here, because the checksum is the whole point.
        //
        // This only reaches an API that Playwright starts. reuseExistingServer
        // is on locally, so a dev server left on :3002 by an earlier run is
        // adopted with whatever environment it was started with, and
        // registration fails as if the manifest were wrong. Stop it first.
        LOSPOR_LEGAL_DOCUMENTS_JSON: cloudLegalDocumentsJson(),
        DATABASE_URL: e2eDatabaseUrl,
        DIRECT_URL: e2eDatabaseUrl,
        LOSPOR_DEPLOYMENT_MODE: "hospital",
        LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED: "true",
        LOSPOR_AUTH_SECRET: "e2e-only-auth-secret-not-for-production-2026",
        NEXTAUTH_SECRET: "e2e-only-auth-secret-not-for-production-2026",
        HOSPITAL_PATIENT_HMAC_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        HOSPITAL_PATIENT_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        HOSPITAL_EXPORT_PSEUDONYM_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        HOSPITAL_STATUS_ACCOUNT_CONTROL_TOKEN_FILE: accountControlTokenFile,
        HOSPITAL_REQUIRE_PATIENT_NUMBER: "true",
        OMOP_PSEUDONYM_SALT: "e2e-only-pseudonym-salt",
        NEXT_TELEMETRY_DISABLED: "1",
        // The suite signs in more than a dozen times from one address against a
        // limit of ten per fifteen minutes, so it exhausts a control it imposed
        // on itself. The API refuses this flag on a production build, on any
        // Vercel deployment, and against the production project — see
        // rateLimitingDisabledForTests.
        LOSPOR_DISABLE_RATE_LIMIT: "true",
      },
    },
    {
      command: `npm run dev -- --port ${e2eWebPort}`,
      url: e2eWebBaseUrl,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        LOSPOR_API_INTERNAL_URL: e2eApiInternalUrl,
        MOBILE_PWA_URL: "",
        E2E_DISABLE_MOBILE_REDIRECT: "true",
      },
    },
  ],
})
