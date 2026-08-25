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
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
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
      command: "npm --prefix ../lospor-api run dev",
      url: "http://localhost:3002/health/live",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        LOSPOR_WEB_URL: "http://localhost:3000",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
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
      },
    },
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        LOSPOR_API_INTERNAL_URL: "http://localhost:3002",
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
      command: "node scripts/serve-pwa.mjs",
      cwd: path.join(__dirname, "..", "lospor-mobile"),
      url: "http://localhost:3001",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        PWA_API_TARGET: "http://localhost:3002",
      },
    },
  ],
})
