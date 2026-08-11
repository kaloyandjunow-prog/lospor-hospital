import { test, expect } from "@playwright/test"
import { E2E_EMAIL, E2E_PASSWORD } from "./credentials"

// Tier 0 smoke — signed-in surface. Requires `npm run e2e:seed`.
//
// Signs in through the real UI rather than reusing a saved session, because a
// stored session hides exactly the failure this is meant to catch: a build where
// the login page renders but cannot actually authenticate.
//
// ONE sign-in per run, and it has to stay one. Login is rate limited to 10 per
// email per 15 minutes (`rateLimit('login:${email}', 10, ...)` in
// lospor-api/src/app/v1/auth/token/route.ts). This file briefly had two tests
// that each signed in, which burns the budget in five runs — and a suite meant to
// run before every commit then starts failing at the login page, looking exactly
// like a broken build. Both assertions live in one test for that reason; if you
// add a third, share this session rather than signing in again.

test("a seeded user can sign in and see their cases", async ({ page }) => {
  await page.goto("/login")
  await page.waitForLoadState("networkidle")

  await page.locator('input[type="email"]').fill(E2E_EMAIL)
  await page.locator('input[type="password"]').fill(E2E_PASSWORD)
  await page.locator('button[type="submit"]').click()

  await page.waitForURL("**/dashboard", { timeout: 15_000 })

  // The dashboard rendered its own content, not just a shell that redirected.
  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible()

  // And at least one case is reachable. Asserting a link rather than a count
  // keeps this true whether the seed leaves 1 case or 200.
  await expect(
    page.locator('a[href*="/cases/"]').first(),
    "no case links on the dashboard — has `npm run e2e:seed` been run?",
  ).toBeVisible()
})
