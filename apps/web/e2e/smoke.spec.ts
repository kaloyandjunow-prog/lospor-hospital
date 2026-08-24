import { test, expect } from "@playwright/test"

import { LOGIN_IDENTIFIER, LOGIN_PASSWORD, LOGIN_SUBMIT } from "./roles"

// Tier 0 smoke — public surface. No seeded database required, so this half runs
// on a fresh clone.
//
// Assert that the public auth pages render real form controls (not a 500 or a
// blank shell), without depending on exact copy. Deeper flows live in the full
// suite.

const API_BASE = process.env.LOSPOR_API_INTERNAL_URL ?? "http://localhost:3002"

test("api is alive and identifies itself", async ({ request }) => {
  const res = await request.get(`${API_BASE}/health/live`)
  expect(res.status()).toBe(200)

  const body = await res.json()
  expect(body.status).toBe("ok")
  expect(body.service).toBe("lospor-api")
  // Shape, not an exact value — pinning the version here would fail on every
  // release. This still catches a dead service or the wrong app on the port.
  expect(body.version).toMatch(/^\d+\.\d+\.\d+$/)
})

// The regression this whole tier exists for.
//
// When Turbopack cannot resolve its workspace root it panics on every rebuild
// ("Next.js package not found", version 0.0.0). Each failed hot update makes
// Fast Refresh fall back to a full reload, which triggers another rebuild, and
// the page reload-loops forever without ever hydrating. Measured at 179
// main-frame navigations in 12 seconds, with no email input ever rendering.
//
// Nothing else catches it: unit tests, tsc and eslint never read .next, so they
// all stay green while the app is completely unusable. It is asserted
// behaviourally rather than by scraping the dev-server log, so it holds however
// the server was started and whatever the underlying cause turns out to be.
test("login page settles instead of reload-looping", async ({ page }) => {
  let navigations = 0
  page.on("framenavigated", frame => {
    if (frame === page.mainFrame()) navigations++
  })

  await page.goto("/login", { waitUntil: "domcontentloaded" })

  // Watch a window long enough for a loop to show itself. A healthy page
  // navigates once or twice here; the broken one managed roughly 60.
  await page.waitForTimeout(4_000)

  expect(
    navigations,
    `/login navigated ${navigations} times in 4s — the dev server is probably `
    + "rebuild-looping. Check its log for a Turbopack panic.",
  ).toBeLessThanOrEqual(3)

  // Hydration actually completed. During the loop this locator never appeared,
  // so it is the second, independent half of the same check. Addressed by id:
  // the first field is username-or-email since 1.2.0, so whether it renders as
  // type="email" now depends on how the deployment is configured.
  await expect(page.locator(LOGIN_IDENTIFIER)).toBeVisible()
})

test("login page renders a credential form", async ({ page }) => {
  const res = await page.goto("/login")
  expect(res?.status() ?? 200).toBeLessThan(400)
  await expect(page.locator(LOGIN_IDENTIFIER)).toBeVisible()
  await expect(page.locator(LOGIN_PASSWORD)).toBeVisible()
  await expect(page.locator(LOGIN_SUBMIT)).toBeVisible()
})

test("register page renders", async ({ page }) => {
  const res = await page.goto("/register")
  expect(res?.status() ?? 200).toBeLessThan(400)
  // Named fields, not `input` first: country and institution are comboboxes
  // that each register a hidden input so the form carries their value, and
  // those come first in the document. A hidden field is not evidence the form
  // rendered — asserting on one is how this check came to pass against a page
  // whose visible half had not appeared.
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.locator('input[type="password"]').first()).toBeVisible()
  await expect(page.locator('button[type="submit"]')).toBeVisible()
})

test("unauthenticated root redirects to login", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveURL(/\/login/)
})
