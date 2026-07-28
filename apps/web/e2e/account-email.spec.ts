import { test, expect } from "@playwright/test"

const PASSWORD = "Strong1!"
const NEW_PASSWORD = "NewStrong1!"

test("register, verify email, reset password, and sign in", async ({ page, request }) => {
  test.setTimeout(75_000)
  const id = Date.now().toString(36)
  const email = `e2e-account-${id}@lospor.test`
  const testIp = `127.0.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`

  const register = await request.post("/api/auth/register", {
    headers: { "x-forwarded-for": testIp },
    data: {
      title: "Dr",
      firstName: "E2E",
      lastName: "Account",
      email,
      password: PASSWORD,
      acceptedTerms: true,
    },
  })
  expect(register.status()).toBe(201)
  const registerBody = await register.json() as { devVerifyUrl?: string; verificationRequired?: boolean; pending?: boolean }
  expect(registerBody.verificationRequired).toBe(true)
  expect(registerBody.pending).toBe(false)
  expect(registerBody.devVerifyUrl).toBeTruthy()

  await page.goto(registerBody.devVerifyUrl!)
  await expect(page).toHaveURL(/\/verify-email\?status=verified/)
  await expect(page.getByText(/Email verified|Имейлът е потвърден/)).toBeVisible()

  await page.goto("/login")
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 })

  const resetRequest = await request.post("/api/auth/password-reset/request", {
    headers: { "x-forwarded-for": testIp },
    data: { email },
  })
  expect(resetRequest.ok()).toBe(true)
  const resetBody = await resetRequest.json() as { devResetUrl?: string }
  expect(resetBody.devResetUrl).toBeTruthy()

  await page.goto(resetBody.devResetUrl!)
  await page.locator('input[type="password"]').first().fill(NEW_PASSWORD)
  await page.locator('input[type="password"]').nth(1).fill(NEW_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await expect(page.getByText(/Password changed|Паролата е променена/)).toBeVisible()

  await page.context().clearCookies()
  await page.goto("/login")
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(NEW_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 })
})
