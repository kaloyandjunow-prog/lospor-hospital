import { expect, test } from "@playwright/test"

const challengeToken = "a".repeat(43)
const manualKey = "A234567A234567A234567A234567A234"
const recoveryCodes = Array.from(
  { length: 10 },
  (_, index) => `${String.fromCharCode(65 + index)}A23-4567-A234-567A`,
)

test("a PWA administrator enrolls TOTP and must save all ten recovery codes", async ({ page }) => {
  let authenticated = false
  let loginClient: string | null = null
  let submittedCode: string | null = null
  const user = {
    id: "admin-e2e",
    email: "admin@hospital.example",
    name: "Dr Admin",
    firstName: "Admin",
    lastName: "Clinician",
    title: "Dr",
    role: "ADMIN",
    institution: { id: "hospital", name: "Hospital", city: "Sofia" },
    preferences: { ui: { locale: "en" } },
  }

  await page.route("**/v1/**", async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === "/v1/locale") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ locale: "en" }) })
      return
    }
    if (path === "/v1/capabilities") {
      // A complete authentication contract. The PWA fails sign-in closed when
      // this block is absent or unrecognised, so an abbreviated stub would
      // never reach the email field this spec types into.
      await route.fulfill({
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
      })
      return
    }
    if (path === "/v1/auth/session" && request.method() === "GET") {
      await route.fulfill({
        status: authenticated ? 200 : 401,
        contentType: "application/json",
        body: JSON.stringify(authenticated ? { user } : { error: "Unauthorized" }),
      })
      return
    }
    if (path === "/v1/auth/session" && request.method() === "POST") {
      loginClient = request.headers()["x-lospor-client"] ?? null
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          code: "MFA_ENROLLMENT_REQUIRED",
          mfa: {
            challengeToken,
            expiresIn: 300,
            enrollmentRequired: true,
            manualKey,
            otpauthUri: `otpauth://totp/LOSPOR%3Aadmin%40hospital.example?secret=${manualKey}&issuer=LOSPOR&algorithm=SHA1&digits=6&period=30`,
          },
        }),
      })
      return
    }
    if (path === "/v1/auth/mfa/login" && request.method() === "POST") {
      const body = request.postDataJSON() as { challengeToken?: string; code?: string }
      expect(body.challengeToken).toBe(challengeToken)
      submittedCode = body.code ?? null
      authenticated = true
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user, recoveryCodes }),
      })
      return
    }
    if (path === "/v1/user") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) })
      return
    }
    if (path === "/v1/cases") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
      return
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  })

  await page.goto("/")
  await page.getByText("EN · English", { exact: true }).click()
  await page.getByPlaceholder("you@hospital.org").fill("admin@hospital.example")
  await page.locator("input[type=password]").fill("Strong1!")
  await page.getByText("Sign in", { exact: true }).click()

  await expect(page.getByText("Set up administrator verification", { exact: true })).toBeVisible()
  await expect(page.getByText(manualKey, { exact: true })).toBeVisible()
  expect(loginClient).toBe("pwa")

  await page.getByLabel("Authenticator code").fill("123456")
  await page.getByText("Verify", { exact: true }).click()

  await expect(page.getByText("Administrator recovery codes", { exact: true })).toBeVisible()
  await expect(page.getByText(recoveryCodes[0], { exact: true })).toBeVisible()
  await expect(page.getByText(recoveryCodes[9], { exact: true })).toBeVisible()
  expect(submittedCode).toBe("123456")
  await expect(page.getByRole("button", { name: "Continue to LOSPOR" })).toBeDisabled()

  await page.getByRole("checkbox", { name: /saved the 10 recovery codes/i }).click()
  await expect(page.getByRole("button", { name: "Continue to LOSPOR" })).toBeEnabled()
  await page.getByRole("button", { name: "Continue to LOSPOR" }).click()
  await expect(page.getByText("New case", { exact: true })).toBeVisible()

  expect(await page.evaluate(() =>
    window.localStorage.getItem("lospor_ss_lospor_access_token"))).toBeNull()
})
