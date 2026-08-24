import { expect, test } from "@playwright/test"
import { ACCOUNTS, E2E_PASSWORD, signInThroughTheScreen } from "./session"

// The login screen itself.
//
// Every other spec injects a token, because driving this screen in each of them
// spent login attempts the rate limiter counts — see session.ts. That trade is
// only honest if the screen is still covered somewhere, which is here.

test("a clinician can sign in and stays signed in", async ({ page }) => {
  await signInThroughTheScreen(page, ACCOUNTS.memberA)

  expect(await page.evaluate(() =>
    window.localStorage.getItem("lospor_ss_lospor_access_token"))).toBeNull()
  const sessionCookie = (await page.context().cookies())
    .find(cookie => cookie.name === "lospor_session")
  expect(sessionCookie).toMatchObject({ httpOnly: true, sameSite: "Lax" })

  // Not merely "the dashboard rendered": the first authenticated read has to
  // succeed too, or the app logs them straight back out.
  await expect(page.getByPlaceholder("you@hospital.org")).toHaveCount(0)
  await page.goto("/settings")
  await expect(page.getByText("Institution", { exact: true })).toBeVisible()
})

test("Bulgarian is the safe login default and an explicit English choice persists", async ({ page }) => {
  await page.route("**/v1/locale", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ locale: "bg" }),
  }))

  await page.goto("/")
  await expect(page.getByText("Влезте", { exact: true })).toBeVisible()
  await expect(page.getByText("BG · Български", { exact: true })).toBeVisible()
  await expect(page.getByText("EN · English", { exact: true })).toBeVisible()

  await page.getByText("EN · English", { exact: true }).click()
  await expect(page.getByText("Sign in", { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText("Sign in", { exact: true })).toBeVisible()
})

test("Hospital capabilities use username-only login and administrator recovery", async ({ page }) => {
  let submitted: Record<string, unknown> | null = null
  await page.route("**/v1/capabilities", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      authentication: {
        loginIdentifier: "USERNAME",
        selfRegistration: false,
        passwordRecovery: "ADMINISTRATOR",
      },
      features: {},
    }),
  }))
  await page.route("**/v1/auth/session", async route => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON() as Record<string, unknown>
    }
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: "INVALID_CREDENTIALS", error: "Invalid credentials" }),
    })
  })

  await page.goto("/")
  await page.getByText("EN · English", { exact: true }).click()
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible()
  await expect(page.getByText(/Usernames preserve the case entered/)).toBeVisible()
  await expect(page.getByPlaceholder("you@hospital.org")).toHaveCount(0)
  await expect(page.getByText("Register", { exact: true })).toHaveCount(0)
  await expect(page.getByText("Forgot password?", { exact: true })).toHaveCount(0)

  await page.getByLabel("Username", { exact: true }).fill("Ivan.Petrov")
  await page.getByLabel("Password", { exact: true }).fill("Strong1!")
  await page.getByText("Sign in", { exact: true }).click()
  await expect.poll(() => submitted).toEqual({
    username: "Ivan.Petrov",
    password: "Strong1!",
    locale: "en",
  })
  expect(submitted).not.toHaveProperty("email")

  await page.getByText("Need help signing in?", { exact: true }).click()
  await expect(page.getByText("Administrator-assisted recovery", { exact: true })).toBeVisible()
  await expect(page.getByText(/does not send an email reset link/)).toBeVisible()
  await expect(page.getByText("Send reset link", { exact: true })).toHaveCount(0)

  await page.goto("/register")
  await expect(page.getByText("Account creation unavailable", { exact: true })).toBeVisible()
  await expect(page.getByText(/hospital administrator must create or activate/)).toBeVisible()
  await expect(page.getByText("Create account", { exact: true })).toHaveCount(0)
})

test("a malformed authentication capability fails the PWA closed", async ({ page }) => {
  await page.route("**/v1/capabilities", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      authentication: {
        loginIdentifier: "HANDLE",
        selfRegistration: true,
        passwordRecovery: "EMAIL",
      },
      features: {},
    }),
  }))

  await page.goto("/")
  await page.getByText("EN · English", { exact: true }).click()
  await expect(page.getByText(/sign-in configuration could not be verified/)).toBeVisible()
  await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0)
  await expect(page.getByLabel("Username", { exact: true })).toHaveCount(0)
  await expect(page.getByText("Register", { exact: true })).toHaveCount(0)
  await expect(page.getByText("Forgot password?", { exact: true })).toHaveCount(0)
})

test("the public capability keeps email registration and recovery navigation", async ({ page }) => {
  await page.route("**/v1/capabilities", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      authentication: {
        loginIdentifier: "EMAIL",
        selfRegistration: true,
        passwordRecovery: "EMAIL",
      },
      features: {},
    }),
  }))

  await page.goto("/")
  await page.getByText("EN · English", { exact: true }).click()
  await expect(page.getByPlaceholder("you@hospital.org")).toBeVisible()
  await expect(page.getByText("Register", { exact: true })).toBeVisible()
  await page.getByText("Forgot password?", { exact: true }).click()
  await expect(page.getByText("Reset password", { exact: true })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Email", exact: true }).last()).toBeVisible()
  await expect(page.getByText("Send reset link", { exact: true })).toBeVisible()
})

test("registration requires an institution and never describes it as optional", async ({ page }) => {
  await page.goto("/")
  await page.getByText("EN · English", { exact: true }).click()
  await page.getByText("Register", { exact: true }).click()

  await expect(page.getByText("Institution *", { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/institution.*optional|optional.*institution/i)).toHaveCount(0)

  await page.goto("/")
  await page.getByText("BG · Български", { exact: true }).click()
  await page.getByText("Регистрирайте се", { exact: true }).click()
  await expect(page.getByText("Институция *", { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/институци.*незадълж|незадълж.*институци/i)).toHaveCount(0)
})

test("a directly opened registration screen returns explicitly to login", async ({ page }) => {
  await page.goto("/register")
  await page.getByText("Вече имате профил? Влезте", { exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText("Влезте", { exact: true })).toBeVisible()
  await expect(page.getByText(/GO_BACK.*not handled/)).toHaveCount(0)
})

test("registration fails closed when the active legal documents cannot be verified", async ({ page }) => {
  await page.route("**/v1/legal/documents?locale=en", route => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "unavailable" }),
  }))

  await page.goto("/")
  await page.getByText("EN · English", { exact: true }).click()
  await page.getByText("Register", { exact: true }).click()

  await expect(page.getByText(
    "The current Terms and Privacy Notice could not be verified. Registration is temporarily unavailable.",
    { exact: true },
  )).toBeVisible()
  await expect(page.getByRole("checkbox")).toBeDisabled()
  await expect(page.getByRole("button", { name: "Create account" })).toBeDisabled()
})

test("a wrong password is refused and nothing is stored", async ({ page }) => {
  await page.goto("/")
  await page.getByText("EN · English", { exact: true }).click()
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
