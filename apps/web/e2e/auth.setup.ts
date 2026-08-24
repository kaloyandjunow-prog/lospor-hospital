import { test as setup, type Page } from "@playwright/test"
import path from "path"
import {
  E2E_EMAIL, E2E_PASSWORD,
  E2E_HOD_A_EMAIL, E2E_MEMBER_A_EMAIL, E2E_MEMBER_A2_EMAIL, E2E_HOD_B_EMAIL, E2E_MEMBER_B_EMAIL,
  E2E_RESEARCH_EMAIL,
} from "./credentials"
import { storageStateFor } from "./roles"

// Logs each E2E identity in once via the real UI and saves the session so the
// authenticated specs reuse it instead of logging in per test. Requires the
// accounts to exist in the target DB first: `npm run e2e:seed`.
//
// One identity was enough while the only question was "does an authenticated
// page load". It is not enough for the rules this suite now covers — see
// roles.ts for why, and for how a spec borrows a given person.
const authFile = path.join(__dirname, ".auth", "user.json")

async function signIn(page: Page, email: string, file: string) {
  await page.goto("/login")
  await page.waitForLoadState("networkidle") // ensure the client has hydrated
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(E2E_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL("**/dashboard", { timeout: 30_000 })
  await page.context().storageState({ path: file })
}

// E2E_EMAIL is the administrator. One sign-in, saved twice: once at the
// historical path so the existing `authed` project is unaffected, and once
// under the name the role-aware specs use.
//
// Deliberately not two sign-ins. Sign-in is rate limited per email (10 in 15
// minutes), so logging the same account in twice per run halved how often the
// suite could be run before it started failing at the login page — which looks
// exactly like a broken login rather than a self-inflicted lockout.
setup("authenticate", async ({ page }) => {
  await signIn(page, E2E_EMAIL, authFile)
  await page.context().storageState({ path: storageStateFor("admin") })
})

setup("authenticate hod-a", async ({ page }) => {
  await signIn(page, E2E_HOD_A_EMAIL, storageStateFor("hod-a"))
})

setup("authenticate member-a", async ({ page }) => {
  await signIn(page, E2E_MEMBER_A_EMAIL, storageStateFor("member-a"))
})

setup("authenticate member-a2", async ({ page }) => {
  await signIn(page, E2E_MEMBER_A2_EMAIL, storageStateFor("member-a2"))
})

setup("authenticate hod-b", async ({ page }) => {
  await signIn(page, E2E_HOD_B_EMAIL, storageStateFor("hod-b"))
})

setup("authenticate member-b", async ({ page }) => {
  await signIn(page, E2E_MEMBER_B_EMAIL, storageStateFor("member-b"))
})

setup("authenticate research", async ({ page }) => {
  await signIn(page, E2E_RESEARCH_EMAIL, storageStateFor("research"))
})
