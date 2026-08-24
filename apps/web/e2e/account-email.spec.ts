import { test, expect } from "@playwright/test"

import { E2E_INSTITUTION_A } from "./credentials"
import { JSON_HEADERS, LOGIN_IDENTIFIER, LOGIN_PASSWORD, LOGIN_SUBMIT } from "./roles"

const PASSWORD = "Strong1!"
const NEW_PASSWORD = "NewStrong1!"

test("register, verify email, change password, and sign in", async ({ page, request }) => {
  test.setTimeout(75_000)
  const id = Date.now().toString(36)
  const email = `e2e-account-${id}@lospor.test`
  const testIp = `127.0.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`
  const legalResponse = await request.get("/api/legal/documents?locale=bg")
  expect(legalResponse.ok()).toBe(true)
  const legalBody = await legalResponse.json() as {
    documents: Array<Record<"deployment" | "kind" | "version" | "effectiveDate" | "locale" | "contentSha256", string>>
  }
  const legalAcceptances = legalBody.documents.map(document => ({
    deployment: document.deployment,
    kind: document.kind,
    version: document.version,
    effectiveDate: document.effectiveDate,
    locale: document.locale,
    contentSha256: document.contentSha256,
  }))

  const register = await request.post("/api/auth/register", {
    headers: { "x-forwarded-for": testIp },
    data: {
      title: "Dr",
      firstName: "E2E",
      lastName: "Account",
      email,
      password: PASSWORD,
      locale: "bg",
      legalAcceptances,
      // Public registration requires a real institution; the historical
      // no-institution sentinel is reserved for post-registration account
      // administration flows.
      institutionId: E2E_INSTITUTION_A,
    },
  })
  expect(register.status()).toBe(201)
  const registerBody = await register.json() as { devVerifyUrl?: string; verificationRequired?: boolean; pending?: boolean }
  expect(registerBody.verificationRequired).toBe(true)
  // Still "nobody has to approve you", but said by omission now. 1.2.0 removed
  // the `pending` flag: registering into a real institution never produced a
  // pending-approval state for an ordinary verified member, and reporting one
  // left people waiting for an approval that was never coming. Verifying the
  // address is the only step between registering and signing in.
  expect(registerBody.pending).toBeUndefined()
  expect(registerBody.devVerifyUrl).toBeTruthy()

  await page.goto(registerBody.devVerifyUrl!)
  await expect(page).toHaveURL(/\/verify-email\?status=verified/)
  await expect(page.getByText(/Email verified|Имейлът е потвърден/)).toBeVisible()


  await page.goto("/login")
  await page.locator(LOGIN_IDENTIFIER).fill(email)
  await page.locator(LOGIN_PASSWORD).fill(PASSWORD)
  await page.locator(LOGIN_SUBMIT).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 })

  // ── asking for a recovery link tells nobody who has an account ─────────
  //
  // This used to hand the reset link straight back in the response under
  // AUTH_EMAIL_TEST_LINKS, which is how this spec used to drive the rest of the
  // recovery flow. 1.2.0 made the endpoint answer one fixed 202 and nothing
  // else: the old body carried `emailSent` and `devResetUrl` for an address
  // that had an account and neither for one that did not, so the shape of the
  // reply was an account-enumeration oracle for anyone holding a list of
  // hospital email addresses. The link now leaves only by email, and no test
  // may ask for it back — so what is asserted here is the property that
  // replaced it: the two answers are byte-for-byte identical.
  const known = await request.post("/api/auth/password-reset/request", {
    headers: { "x-forwarded-for": testIp },
    data: { email },
  })
  const unknown = await request.post("/api/auth/password-reset/request", {
    headers: { "x-forwarded-for": testIp },
    data: { email: `e2e-no-such-account-${id}@lospor.test` },
  })
  expect(known.status()).toBe(202)
  expect(unknown.status()).toBe(202)
  expect(await known.text()).toBe(await unknown.text())
  expect(await known.json()).toEqual({ ok: true })

  // ── and the password can still actually be changed ─────────────────────
  //
  // Through the signed-in route, which is the half of recovery a browser can
  // still reach without reading the mailbox. The emailed leg is covered by the
  // API's own tests, which can see the token it issues.
  //
  // page.request, not the test-level `request` fixture: the session lives in
  // the page context's cookie jar, and only page.request shares it. JSON_HEADERS
  // carries the Origin a cookie-authenticated write now has to present.
  const changed = await page.request.post("/api/user/change-password", {
    headers: JSON_HEADERS,
    data: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
  })
  expect(changed.ok(), await changed.text()).toBeTruthy()

  await page.context().clearCookies()
  await page.goto("/login")
  await page.locator(LOGIN_IDENTIFIER).fill(email)

  // The old password is dead. Asserted on the sign-in response rather than on
  // the URL: a page that simply has not navigated yet is still /login, so the
  // URL alone would pass whether or not the old password had been refused.
  await page.locator(LOGIN_PASSWORD).fill(PASSWORD)
  const [refused] = await Promise.all([
    page.waitForResponse(response =>
      response.url().includes("/api/auth/session") && response.request().method() === "POST"),
    page.locator(LOGIN_SUBMIT).click(),
  ])
  expect(refused.status()).toBe(401)
  await expect(page).toHaveURL(/\/login/)

  await page.locator(LOGIN_PASSWORD).fill(NEW_PASSWORD)
  await page.locator(LOGIN_SUBMIT).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 })
})
