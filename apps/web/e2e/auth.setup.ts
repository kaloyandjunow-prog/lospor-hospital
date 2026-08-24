import { test as setup, type Page } from "@playwright/test"
import path from "path"
import { EMAIL_FOR, signInWithPassword, storageStateFor } from "./roles"

// Logs each E2E identity in once via the real UI and saves the session so the
// authenticated specs reuse it instead of logging in per test. Requires the
// accounts to exist in the target DB first: `npm run e2e:seed`.
//
// One identity was enough while the only question was "does an authenticated
// page load". It is not enough for the rules this suite now covers — see
// roles.ts for why, and for how a spec borrows a given person.
//
// The sign-in itself lives in roles.ts, because a spec that moves somebody
// between departments has to repeat it mid-run (reauthenticate) and the two
// must not drift apart.
const authFile = path.join(__dirname, ".auth", "user.json")

async function signIn(page: Page, role: keyof typeof EMAIL_FOR, file: string) {
  await signInWithPassword(page, EMAIL_FOR[role])
  await page.context().storageState({ path: file })
}

// The administrator. One sign-in, saved twice: once at the historical path so
// the existing `authed` project is unaffected, and once under the name the
// role-aware specs use.
//
// Deliberately not two sign-ins. Sign-in is rate limited per email (10 in 15
// minutes), so logging the same account in twice per run halved how often the
// suite could be run before it started failing at the login page — which looks
// exactly like a broken login rather than a self-inflicted lockout.
setup("authenticate", async ({ page }) => {
  await signIn(page, "admin", authFile)
  await page.context().storageState({ path: storageStateFor("admin") })
})

setup("authenticate hod-a", async ({ page }) => {
  await signIn(page, "hod-a", storageStateFor("hod-a"))
})

setup("authenticate member-a", async ({ page }) => {
  await signIn(page, "member-a", storageStateFor("member-a"))
})

setup("authenticate member-a2", async ({ page }) => {
  await signIn(page, "member-a2", storageStateFor("member-a2"))
})

setup("authenticate hod-b", async ({ page }) => {
  await signIn(page, "hod-b", storageStateFor("hod-b"))
})

setup("authenticate member-b", async ({ page }) => {
  await signIn(page, "member-b", storageStateFor("member-b"))
})

setup("authenticate research", async ({ page }) => {
  await signIn(page, "research", storageStateFor("research"))
})
