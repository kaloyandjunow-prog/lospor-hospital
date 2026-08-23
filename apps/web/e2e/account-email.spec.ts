import { test, expect } from "@playwright/test"

const HOSPITAL_PASSWORD = "HospitalActivated1!"
const STATUS_ACCOUNT_CONTROL_TOKEN = "e2e-status-account-control-token-not-secret-2026"
const STATUS_HEADERS = { Authorization: `Bearer ${STATUS_ACCOUNT_CONTROL_TOKEN}` }

test("Hospital self-registration stays disabled", async ({ request }) => {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const email = `refused-self-registration-${id}@lospor.test`
  const testIp = `127.0.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`

  const register = await request.post("/api/auth/register", {
    headers: { "x-forwarded-for": testIp },
    data: {
      title: "Dr",
      firstName: "E2E",
      lastName: "Account",
      email,
      password: HOSPITAL_PASSWORD,
      acceptedTerms: true,
      institutionId: "e2e-institution",
    },
  })
  expect(register.status()).toBe(403)
  expect(await register.json()).toMatchObject({
    code: "SELF_REGISTRATION_DISABLED",
  })
})

test("Status activation is local, replaceable, one-use, and leads to onboarding", async ({ page, request }) => {
  test.setTimeout(75_000)
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const email = `hospital-activation-${id}@lospor.test`

  const directoryResponse = await request.get("/api/internal/hospital/accounts", {
    headers: STATUS_HEADERS,
  })
  expect(directoryResponse.ok(), await directoryResponse.text()).toBeTruthy()
  const directory = await directoryResponse.json() as {
    institutions: Array<{ id: string; canHaveHeadOfDepartment: boolean }>
  }
  const institution = directory.institutions.find(item => item.canHaveHeadOfDepartment)
  expect(institution).toBeDefined()

  const createdResponse = await request.post("/api/internal/hospital/accounts", {
    headers: STATUS_HEADERS,
    data: {
      email,
      firstName: "Hospital",
      lastName: "Activation",
      title: "Dr",
      institutionId: institution!.id,
      accessProfile: "CLINICAL_MEMBER",
      locale: "en",
    },
  })
  expect(createdResponse.status(), await createdResponse.text()).toBe(201)
  expect(createdResponse.headers()["cache-control"]).toContain("no-store")
  const created = await createdResponse.json() as {
    account: { id: string; email: string }
    oneTimeLink: { purpose: "ACTIVATION"; url: string; expiresAt: string }
  }
  expect(created.account.email).toBe(email)
  expect(created.oneTimeLink.purpose).toBe("ACTIVATION")
  expect(Date.parse(created.oneTimeLink.expiresAt)).toBeGreaterThan(Date.now())
  const oldToken = new URLSearchParams(new URL(created.oneTimeLink.url).hash.slice(1))
    .get("hospitalToken")
  expect(oldToken).toBeTruthy()

  const replacementResponse = await request.post(
    `/api/internal/hospital/accounts/${encodeURIComponent(created.account.id)}/activation`,
    { headers: STATUS_HEADERS },
  )
  expect(replacementResponse.ok(), await replacementResponse.text()).toBeTruthy()
  const replacementBody = await replacementResponse.json() as {
    oneTimeLink: { purpose: "ACTIVATION"; url: string; expiresAt: string }
  }
  const replacement = replacementBody.oneTimeLink
  expect(replacement.purpose).toBe("ACTIVATION")
  expect(Date.parse(replacement.expiresAt)).toBeGreaterThan(Date.now())
  const replacementToken = new URLSearchParams(new URL(replacement.url).hash.slice(1))
    .get("hospitalToken")
  expect(replacementToken).toBeTruthy()
  expect(replacementToken).not.toBe(oldToken)

  const refusedOldLink = await request.post("/api/auth/password-reset/confirm", {
    data: { token: oldToken, password: HOSPITAL_PASSWORD },
  })
  expect(refusedOldLink.status()).toBe(400)
  expect((await refusedOldLink.json()).code).toBe("INVALID_OR_EXPIRED_ACCOUNT_LINK")

  await page.goto(replacement.url)
  await page.locator('input[type="password"]').first().fill(HOSPITAL_PASSWORD)
  await page.locator('input[type="password"]').nth(1).fill(HOSPITAL_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await expect(page.getByText(/Password changed|Паролата е променена/)).toBeVisible()

  const reusedLink = await request.post("/api/auth/password-reset/confirm", {
    data: { token: replacementToken, password: "HospitalReused1!" },
  })
  expect(reusedLink.status()).toBe(400)
  expect((await reusedLink.json()).code).toBe("INVALID_OR_EXPIRED_ACCOUNT_LINK")

  await page.goto("/login")
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(HOSPITAL_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 })

  const onboarding = page.getByRole("dialog", { name: /Welcome to LOSPOR|Добре дошли в LOSPOR/ })
  await expect(onboarding).toBeVisible()
  await onboarding.locator('input[type="checkbox"]').check()
  await onboarding.getByRole("button", { name: /Continue|Продължи|Продължаване/ }).click()
  await expect(onboarding).toBeHidden()
  await page.reload()
  await expect(onboarding).toBeHidden()

  const activeDirectoryResponse = await request.get("/api/internal/hospital/accounts", {
    headers: STATUS_HEADERS,
  })
  expect(activeDirectoryResponse.ok()).toBeTruthy()
  const activeDirectory = await activeDirectoryResponse.json() as {
    accounts: Array<{ id: string; state: string; activeActivationExpiresAt: string | null }>
  }
  expect(activeDirectory.accounts.find(item => item.id === created.account.id)).toMatchObject({
    state: "ACTIVE",
    activeActivationExpiresAt: null,
  })
})
