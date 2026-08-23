import { expect, test } from "@playwright/test"
import { ACCOUNTS, E2E_PASSWORD, signInThroughTheScreen } from "./session"

// HOSPITAL_LOCALE_E2E_DEFAULT_BG
// HOSPITAL_LOCALE_E2E_VISIBLE_CHOICES
// HOSPITAL_LOCALE_E2E_ACCOUNT_TAKEOVER

test("Bulgarian is the safe default and both login languages are visible", async ({ page }) => {
  await page.route("**/v1/locale", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ locale: "bg" }) }))
  await page.goto("/")
  await expect(page.getByText("Вход", { exact: true })).toBeVisible()
  await expect(page.getByText("Български", { exact: true })).toBeVisible()
  await expect(page.getByText("English", { exact: true })).toBeVisible()
})

// The login screen itself.
//
// Every other spec injects a token, because driving this screen in each of them
// spent login attempts the rate limiter counts — see session.ts. That trade is
// only honest if the screen is still covered somewhere, which is here.

test("a clinician can sign in and stays signed in", async ({ page }) => {
  await signInThroughTheScreen(page, ACCOUNTS.memberA)

  // Not merely "the dashboard rendered": the first authenticated read has to
  // succeed too, or the app logs them straight back out.
  await expect(page.getByPlaceholder("ivan.petrov")).toHaveCount(0)
  await page.goto("/settings")
  await expect(page.getByText("Institution", { exact: true })).toBeVisible()
})

test("a wrong password is refused and nothing is stored", async ({ page }) => {
  await page.goto("/")
  await page.getByText("English", { exact: true }).click()
  await page.getByPlaceholder("ivan.petrov").fill(ACCOUNTS.memberA)
  await page.locator("input[type=password]").fill(`${E2E_PASSWORD}-wrong`)
  await page.getByText("Sign in", { exact: true }).click()

  // Still on the login screen, and no bearer token left behind for the next
  // person to pick up on a shared ward device.
  await expect(page.getByPlaceholder("ivan.petrov")).toBeVisible()
  const token = await page.evaluate(() =>
    window.localStorage.getItem("lospor_ss_lospor_access_token"))
  expect(token).toBeNull()
})

test("Hospital capabilities submit a case-preserving username with no email fallback", async ({ page }) => {
  let submitted: Record<string, unknown> | null = null
  await page.route("**/v1/capabilities", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authentication: {
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    } }),
  }))
  await page.route("**/v1/auth/token", async route => {
    submitted = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({ status: 401, contentType: "application/json", body: "{}" })
  })

  await page.goto("/")
  await page.getByText("English", { exact: true }).click()
  await expect(page.getByLabel(/username|потребителско име/i)).toBeVisible()
  await expect(page.getByPlaceholder("you@hospital.org")).toHaveCount(0)
  await expect(page.getByText(/3.{0,5}64/)).toBeVisible()
  await page.getByPlaceholder("ivan.petrov").fill("Ivan.Petrov_2")
  await page.locator("input[type=password]").fill("Password!1")
  await page.getByText("Sign in", { exact: true }).click()
  await expect.poll(() => submitted).toEqual({
    username: "Ivan.Petrov_2",
    password: "Password!1",
  })
  expect(submitted).not.toHaveProperty("email")
})

test("a malformed authentication capability fails the PWA closed", async ({ page }) => {
  await page.route("**/v1/capabilities", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authentication: {
      loginIdentifier: "HANDLE",
      selfRegistration: true,
      passwordRecovery: "EMAIL",
    } }),
  }))
  await page.goto("/")
  await expect(page.getByRole("alert")).toBeVisible()
  await expect(page.locator("input")).toHaveCount(0)
})
