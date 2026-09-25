import { defineConfig, devices } from "@playwright/test"
import path from "path"
import { cloudLegalDocumentsJson } from "./e2e/legal-documents"

// One clinician, one case, two apps.
//
// The web app and the phone app are separate programs that share an API: the
// web app is Next.js on cookies and the PWA is lospor-mobile exported by Expo;
// both use an HttpOnly cookie on their own origin. Each has had its own suite
// for a while, and neither has ever run against the other — so "I filled this in
// on the ward computer and it was not on my phone" has had no test that could
// catch it.
//
// This config is the only place both are up at once. It reuses the web suite's
// global setup so both apps see the same freshly seeded database.
//
//   npm run e2e:crossapp
//
// The PWA must be rebuilt first with its same-origin /v1 path. The development
// static server below proxies that path to the shared API, matching the
// appliance topology without granting JavaScript access to a token.
const authFile = path.join(__dirname, "e2e", ".auth", "user.json")
const skipWebServer = process.env.E2E_SKIP_WEBSERVER === "true"
const accountControlTokenFile = path.join(
  __dirname,
  "e2e",
  "fixtures",
  "status-account-control-token",
)

function e2ePort(name: "E2E_WEB_PORT" | "E2E_API_PORT", fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  if (!/^\d+$/.test(raw)) throw new Error(name + " must be a TCP port number")
  const port = Number(raw)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(name + " must be between 1 and 65535")
  }
  return port
}

const e2eWebPort = e2ePort("E2E_WEB_PORT", 3310)
const e2eApiPort = e2ePort("E2E_API_PORT", 3312)
const e2ePwaPort = Number(process.env.E2E_PWA_PORT ?? "3001")
if (!Number.isSafeInteger(e2ePwaPort) || e2ePwaPort < 1 || e2ePwaPort > 65_535) {
  throw new Error("E2E_PWA_PORT must be between 1 and 65535")
}
const e2eWebBaseUrl = process.env.E2E_BASE_URL ?? ("http://localhost:" + e2eWebPort)
const e2eApiInternalUrl = process.env.E2E_API_INTERNAL_URL ?? ("http://127.0.0.1:" + e2eApiPort)
const e2ePwaBaseUrl = process.env.PWA_E2E_BASE_URL ?? ("http://localhost:" + e2ePwaPort)
process.env.E2E_BASE_URL ??= e2eWebBaseUrl
process.env.E2E_API_BASE ??= e2eApiInternalUrl
process.env.LOSPOR_API_INTERNAL_URL ??= e2eApiInternalUrl
process.env.PWA_E2E_BASE_URL ??= e2ePwaBaseUrl
process.env.LOSPOR_DEPLOYMENT_MODE ??= "hospital"

const e2eDatabaseUrl = process.env.E2E_DATABASE_URL
  ?? "postgresql://lospor:lospor-e2e@127.0.0.1:55433/lospor_e2e"

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Longer than the web suite's 30s: these specs drive two applications and
  // wait for a save in one to become visible in the other.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // One worker, for the same reason as the web suite — the specs share one
  // database and one set of seeded accounts.
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
    {
      name: "crossapp",
      testMatch: /\.crossapp\.spec\.ts$/,
      dependencies: ["setup"],
      // Desktop, because the web half is the desktop app. The PWA half opens
      // its own phone-sized context inside each spec.
      use: { ...devices["Desktop Chrome"], storageState: authFile },
    },
  ],
  webServer: skipWebServer ? undefined : [
    {
      command: "npm exec -- next dev --port " + e2eApiPort,
      cwd: "../api",
      url: e2eApiInternalUrl + "/health/live",
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
        // Both apps sign the same accounts in during one run, which exhausts a
        // limit this project imposed on itself. The API refuses this flag on a
        // production build and against the production project.
        LOSPOR_DISABLE_RATE_LIMIT: "true",
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
      },
    },
    {
      command: "npm run dev -- --port " + e2eWebPort,
      url: e2eWebBaseUrl,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        LOSPOR_API_INTERNAL_URL: e2eApiInternalUrl,
        // The redirect to the PWA is by user agent, and the phone-sized context
        // in these specs would trip it. The PWA is opened directly instead, so
        // each spec says which app it is driving.
        MOBILE_PWA_URL: "",
        E2E_DISABLE_MOBILE_REDIRECT: "true",
      },
    },
    {
      // Serves lospor-mobile/dist. `cwd` matters: the server resolves "dist"
      // relative to where it runs.
      // Export immediately before serving so this suite cannot exercise a
      // stale ignored dist/ directory or service-worker cache.
      command: "npm run export:web && node scripts/serve-pwa.mjs",
      cwd: path.join(__dirname, "..", "pwa"),
      url: e2ePwaBaseUrl,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        PWA_PORT: String(e2ePwaPort),
        PWA_API_PROXY_TARGET: e2eApiInternalUrl,
      },
    },
  ],
})
