import { defineConfig, devices } from "@playwright/test"
import { cloudLegalDocumentsJson } from "./e2e/legal-documents"

// Tier 0 — "is this build alive". Runs before a commit, and FIRST after any
// migration, dependency change or machine move. Target: under 60 seconds.
//
// Deliberately narrow. It answers one question and answers it fast; the full
// suite (playwright.config.ts) is what proves behaviour. If this file grows past
// a minute, move the new test into the full suite instead.
//
// The API is covered from here rather than from lospor-api, which has no
// Playwright dependency — and the app's webServer starts the API anyway, so
// there is nothing extra to run.
//
// `smoke-authed` needs the seeded accounts: `npm run e2e:seed` first.
// Sign-in is rate limited to 10 per email per 15 minutes, and the seeder clears
// those counters, so re-seed rather than waiting if smoke starts failing at the
// login page after many runs.
const skipWebServer = process.env.E2E_SKIP_WEBSERVER === "true"

export default defineConfig({
  testDir: "./e2e",

  // Tight, because failing fast is half the value. Measured: a healthy run is
  // ~10 s. With the generous 45 s timeout this file started with, a build that
  // hung during compilation took 3.7 MINUTES to report — by which point you have
  // switched tasks and the fast-feedback loop is gone.
  timeout: 25_000,
  expect: { timeout: 7_000 },

  // Stop at the first failure. Smoke answers one yes/no question; once the
  // answer is no, the remaining tests only add waiting. This turns that same
  // hung-build case from 3.7 minutes into about 30 seconds.
  maxFailures: 1,

  fullyParallel: false,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: 0, // a smoke test that needs a retry is telling you something
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [
    { name: "smoke", testMatch: /smoke\.spec\.ts$/ },
    // Named with a hyphen, not a dot: `*.authed.spec.ts` is claimed by the full
    // suite's `authed` project, which injects a saved session. This spec must
    // sign in for real, so it has to stay outside that pattern.
    { name: "smoke-authed", testMatch: /smoke-authed\.spec\.ts$/ },
  ],
  webServer: skipWebServer ? undefined : [
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
