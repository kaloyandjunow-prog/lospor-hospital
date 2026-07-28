import { test as setup } from "@playwright/test"
import path from "path"
import { E2E_EMAIL, E2E_PASSWORD } from "./credentials"

// Logs in once via the real UI and saves the session so authenticated specs
// (*.authed.spec.ts) reuse it instead of logging in each time. Requires the
// E2E user to exist in the target DB first: `npm run e2e:seed`.
const authFile = path.join(__dirname, ".auth", "user.json")

setup("authenticate", async ({ page }) => {
  await page.goto("/login")
  await page.waitForLoadState("networkidle") // ensure the client has hydrated
  await page.locator('input[type="email"]').fill(E2E_EMAIL)
  await page.locator('input[type="password"]').fill(E2E_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL("**/dashboard", { timeout: 30_000 })
  await page.context().storageState({ path: authFile })
})
