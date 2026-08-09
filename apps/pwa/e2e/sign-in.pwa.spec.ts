import { expect, test } from "@playwright/test"
import { ACCOUNTS, E2E_PASSWORD, signInThroughTheScreen } from "./session"

// The login screen itself.
//
// Every other spec injects a token, because driving this screen in each of them
// spent login attempts the rate limiter counts — see session.ts. That trade is
// only honest if the screen is still covered somewhere, which is here.

test("a clinician can sign in and stays signed in", async ({ page }) => {
  await signInThroughTheScreen(page, ACCOUNTS.memberA)

  // Not merely "the dashboard rendered": the first authenticated read has to
  // succeed too, or the app logs them straight back out.
  await expect(page.getByPlaceholder("you@hospital.org")).toHaveCount(0)
  await page.goto("/settings")
  await expect(page.getByText("Institution", { exact: true })).toBeVisible()
})

test("a wrong password is refused and nothing is stored", async ({ page }) => {
  await page.goto("/")
  await page.getByPlaceholder("you@hospital.org").fill(ACCOUNTS.memberA)
  await page.locator("input[type=password]").fill(`${E2E_PASSWORD}-wrong`)
  await page.getByText("Sign in", { exact: true }).click()

  // Still on the login screen, and no bearer token left behind for the next
  // person to pick up on a shared ward device.
  await expect(page.getByPlaceholder("you@hospital.org")).toBeVisible()
  const token = await page.evaluate(() =>
    window.localStorage.getItem("lospor_ss_lospor_access_token"))
  expect(token).toBeNull()
})
