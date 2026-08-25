import { expect, test } from "@playwright/test"

const hospitalAuthentication = {
  authentication: {
    loginIdentifier: "USERNAME",
    selfRegistration: false,
    passwordRecovery: "ADMINISTRATOR",
  },
}

test.beforeEach(async ({ context }) => {
  await context.clearCookies()
})

test("Hospital capability requires username and disables both public self-service routes", async ({ page }) => {
  let loginPayload: unknown
  await page.route("**/api/capabilities", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(hospitalAuthentication),
  }))
  await page.route("**/api/auth/session", async route => {
    loginPayload = route.request().postDataJSON()
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: "INVALID_CREDENTIALS" }),
    })
  })

  await page.goto("/login")
  const username = page.getByLabel("Потребителско име")
  await expect(username).toHaveAttribute("type", "text")
  await expect(page.locator('input[type="email"]')).toHaveCount(0)
  await expect(page.getByText(/3 до 64 знака/)).toBeVisible()
  await expect(page.getByText(/проверката за уникалност не различават/)).toBeVisible()
  await expect(page.getByText(/може да бъде изписано на кирилица/)).toBeVisible()
  await expect(page.getByRole("link", { name: "Забравена парола?" })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Създайте акаунт" })).toHaveCount(0)

  await username.fill("Ivan.Petrov_2")
  await page.getByLabel("Парола").fill("Password!1")
  await page.getByRole("button", { name: "Вход" }).click()
  await expect.poll(() => loginPayload).toEqual({
    username: "Ivan.Petrov_2",
    password: "Password!1",
  })

  await page.goto("/register")
  await expect(page.getByRole("heading", { name: "Акаунтите се създават от администратор" })).toBeVisible()
  await expect(page.locator("form")).toHaveCount(0)

  await page.goto("/forgot-password")
  await expect(page.getByRole("heading", { name: "Паролата се нулира от администратор" })).toBeVisible()
  await expect(page.locator("form")).toHaveCount(0)
})

test("Cloud capability keeps email login, registration, and email recovery", async ({ page }) => {
  await page.route("**/api/capabilities", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      authentication: {
        loginIdentifier: "EMAIL",
        selfRegistration: true,
        passwordRecovery: "EMAIL",
      },
    }),
  }))

  await page.goto("/login")
  await expect(page.getByLabel("Имейл")).toHaveAttribute("type", "email")
  await expect(page.getByRole("link", { name: "Забравена парола?" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Създайте акаунт" })).toBeVisible()
})

test("an unavailable Hospital policy provides no email or username fallback", async ({ page }) => {
  await page.route("**/api/capabilities", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      authentication: {
        loginIdentifier: "USERNAME",
        selfRegistration: false,
        passwordRecovery: "UNAVAILABLE",
      },
    }),
  }))

  await page.goto("/login")
  await expect(page.getByRole("heading", { name: "Настройките за вход не са достъпни" })).toBeVisible()
  await expect(page.locator("form")).toHaveCount(0)
  await expect(page.locator('input[type="email"]')).toHaveCount(0)
  await expect(page.getByLabel("Потребителско име")).toHaveCount(0)

  await page.goto("/register")
  await expect(page.getByRole("heading", { name: "Настройките за вход не са достъпни" })).toBeVisible()
  await expect(page.locator("form")).toHaveCount(0)

  await page.goto("/forgot-password")
  await expect(page.getByRole("heading", { name: "Настройките за вход не са достъпни" })).toBeVisible()
  await expect(page.locator("form")).toHaveCount(0)
})
