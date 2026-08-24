import { expect, test } from "@playwright/test"

test.beforeEach(async ({ context }) => {
  await context.clearCookies()
})

test("Bulgarian is the public default and English is an explicit prominent choice", async ({ page }) => {
  await page.goto("/login")
  await expect(page.locator("html")).toHaveAttribute("lang", "bg")
  await expect(page.getByRole("button", { name: "Български" })).toBeVisible()
  await expect(page.getByRole("button", { name: "English" })).toBeVisible()
  await expect(page.getByText("Въведете данните си за достъп")).toBeVisible()

  await page.getByRole("button", { name: "English" }).click()
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
  await expect(page.getByText("Enter your credentials to access your account")).toBeVisible()
})

test("Terms and Privacy are separately selectable and expose exact metadata", async ({ page }) => {
  await page.goto("/terms")
  await expect(page.getByRole("heading", { name: "Условия за ползване" })).toBeVisible()
  await expect(page.getByText("SHA-256 на съдържанието")).toBeVisible()
  await expect(page.getByText("Облачна демонстрационна среда")).toBeVisible()
  await expect(page.locator("code, .font-mono").filter({ hasText: /^[a-f0-9]{64}$/ })).toBeVisible()

  await page.getByRole("button", { name: "English" }).click()
  await expect(page.getByRole("heading", { name: "Terms of Use" })).toBeVisible()
  await page.getByRole("link", { name: "Privacy Policy" }).click()
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible()
})

test("public registration excludes no-institution and generic rows", async ({ page }) => {
  await page.route("**/api/institutions", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "hospital-1", name: "УМБАЛ Тест", city: "София" },
        { id: "no-institution", name: "Без институция", city: "—" },
        { id: "other", name: "Other / Private", city: "—" },
      ]),
    })
  })

  await page.goto("/register")
  const comboboxes = page.getByRole("combobox")
  await comboboxes.nth(1).click()
  await page.getByRole("option", { name: "България" }).click()
  await expect(comboboxes.nth(1)).toHaveText(/България/)
  await expect(comboboxes.nth(1)).not.toHaveText(/Bulgaria/)
  await page.getByRole("button", { name: /Изберете вашето лечебно заведение/ }).click()
  await expect(page.getByText("УМБАЛ Тест")).toBeVisible()
  await expect(page.getByText("Без институция")).toHaveCount(0)
  await expect(page.getByText("Other / Private")).toHaveCount(0)
})

test("research-only login denial is localized and callback queries remain internal", async ({ page }) => {
  await page.goto("/dashboard?from=localization-test")
  await expect(page).toHaveURL(url =>
    url.pathname === "/login"
    && url.searchParams.get("callbackUrl") === "/dashboard?from=localization-test",
  )

  await page.route("**/api/auth/session", async route => {
    if (route.request().method() !== "POST") return route.continue()
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ code: "CLINICAL_APP_FORBIDDEN", error: "raw API prose" }),
    })
  })
  await page.locator('input[type="email"]').fill("research@example.test")
  await page.locator('input[type="password"]').fill("Password!1")
  await page.locator('button[type="submit"]').click()
  await expect(page.getByText("Този акаунт е само за изследователския модул и няма достъп до клиничното приложение.")).toBeVisible()
  await expect(page.getByText("raw API prose")).toHaveCount(0)
})

test("administrator MFA enrollment is Bulgarian-first and blocks continuation until recovery codes are saved", async ({ page }) => {
  const challengeToken = "a".repeat(43)
  const manualKey = "A234567A234567A234567A234567A234"
  const recoveryCodes = Array.from(
    { length: 10 },
    (_, index) => `${String.fromCharCode(65 + index)}A23-4567-A234-567A`,
  )
  let submittedMfa: unknown

  await page.route("**/api/auth/session", async route => {
    if (route.request().method() !== "POST") return route.continue()
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        code: "MFA_ENROLLMENT_REQUIRED",
        mfa: {
          code: "MFA_ENROLLMENT_REQUIRED",
          challengeToken,
          expiresIn: 300,
          enrollmentRequired: true,
          manualKey,
          otpauthUri: `otpauth://totp/LOSPOR%3Aadmin%40example.test?secret=${manualKey}&issuer=LOSPOR`,
        },
      }),
    })
  })
  await page.route("**/api/auth/mfa/login", async route => {
    submittedMfa = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { id: "admin" }, recoveryCodes }),
    })
  })

  await page.goto("/login")
  await page.locator('input[type="email"]').fill("admin@example.test")
  await page.locator('input[type="password"]').fill("Password!1")
  await page.locator('button[type="submit"]').click()
  await expect(page.getByRole("heading", { name: "Настройте приложението за удостоверяване" })).toBeVisible()
  await expect(page.getByText(manualKey)).toBeVisible()

  await page.getByLabel("Шестцифрен код от приложението").fill("123456")
  await page.getByRole("button", { name: "Потвърди и влез" }).click()
  await expect(page.getByRole("heading", { name: "Запазете резервните кодове сега" })).toBeVisible()
  await expect(page.getByRole("list", { name: "Еднократни резервни кодове" }).getByRole("listitem")).toHaveCount(10)
  expect(submittedMfa).toEqual({ challengeToken, code: "123456" })

  const continueButton = page.getByRole("button", { name: "Продължи към LOSPOR" })
  await expect(continueButton).toBeDisabled()
  await page.getByLabel(/Запазих или разпечатах всичките десет/).check()
  await expect(continueButton).toBeEnabled()
})
