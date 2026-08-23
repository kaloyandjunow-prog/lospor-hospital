import { expect, test } from "@playwright/test"

test("Hospital username capability has no email or self-service fallback", async ({ page }) => {
  let payload: unknown
  await page.route("**/api/capabilities", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authentication: {
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    } }),
  }))
  await page.route("**/api/auth/session", async route => {
    payload = route.request().postDataJSON()
    await route.fulfill({ status: 401, contentType: "application/json", body: "{}" })
  })

  await page.goto("/login")
  const username = page.locator("#login-identifier")
  await expect(username).toHaveAttribute("type", "text")
  await expect(page.locator('input[type="email"]')).toHaveCount(0)
  await expect(page.getByText(/3.{0,5}64/)).toBeVisible()
  await expect(page.getByText(/@/)).toBeVisible()
  await expect(page.getByRole("link", { name: /forgot|забравена/i })).toHaveCount(0)
  await username.fill("Ivan.Petrov_2")
  await page.locator("#login-password").fill("Password!1")
  await page.locator('button[type="submit"]').click()
  await expect.poll(() => payload).toEqual({
    username: "Ivan.Petrov_2",
    password: "Password!1",
  })

  await page.goto("/register")
  await expect(page).toHaveURL(/\/login/)
  await expect(page.locator("#login-identifier")).toHaveAttribute("type", "text")
  await page.goto("/forgot-password")
  await expect(page).toHaveURL(/\/forgot-password/)
  await expect(page.locator('input[type="email"]')).toHaveCount(0)
  await expect(page.locator("form")).toHaveCount(0)
  await expect(page.getByRole("link", { name: /sign in|вход/i })).toHaveAttribute("href", "/login")
})

test("contradictory username policy fails closed", async ({ page }) => {
  await page.route("**/api/capabilities", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authentication: {
      loginIdentifier: "USERNAME",
      selfRegistration: true,
      passwordRecovery: "EMAIL",
    } }),
  }))
  await page.goto("/login")
  await expect(page.locator("form")).toHaveCount(0)
  await expect(page.locator("#login-identifier")).toHaveCount(0)
})
