import { test, expect } from "@playwright/test"

// Resilient smoke tests: assert the public auth pages render real form
// controls (not a 500 / blank shell), without depending on exact copy or a
// seeded database. Deeper flows (login → preop → intraop → finalize) build on
// this once a seeded test user/DB is wired in CI.

test("login page renders a credential form", async ({ page }) => {
  const res = await page.goto("/login")
  expect(res?.status() ?? 200).toBeLessThan(400)
  await expect(page.locator('input[type="password"]')).toBeVisible()
  await expect(page.locator("input").first()).toBeVisible()
  await expect(page.getByRole("button").first()).toBeVisible()
})

test("register page renders", async ({ page }) => {
  const res = await page.goto("/register")
  expect(res?.status() ?? 200).toBeLessThan(400)
  await expect(page.locator("input").first()).toBeVisible()
  await expect(page.getByRole("button").first()).toBeVisible()
})

test("unauthenticated root redirects to login", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveURL(/\/login/)
})
