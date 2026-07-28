import { test, expect } from "@playwright/test"

// Uses the saved session from auth.setup.ts. Proves the dev-DB-backed auth
// works end-to-end and protected routes render for a signed-in user. Reads
// only (creates no persistent data → no cleanup needed).

test("authenticated user lands on the dashboard, not login", async ({ page }) => {
  await page.goto("/")
  await expect(page).not.toHaveURL(/\/login/)
  await expect(page.getByRole("button").first()).toBeVisible()
})

test("authenticated user can open the new-case (preop) form", async ({ page }) => {
  await page.goto("/cases/new")
  await expect(page).not.toHaveURL(/\/login/)
  await expect(page.locator("input, select, button").first()).toBeVisible()
})
