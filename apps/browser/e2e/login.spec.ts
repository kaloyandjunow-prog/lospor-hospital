import { expect, test } from "@playwright/test"

// HOSPITAL_LOCALE_E2E_DEFAULT_BG: a fresh visitor with no stored choice must
// see the standalone sign-in experience in Bulgarian, the appliance's
// configured default.
// HOSPITAL_LOCALE_E2E_VISIBLE_CHOICES: the switcher must expose both
// configured languages, not only the one a fresh visitor lands on.
test("defaults the standalone sign-in experience to Bulgarian and keeps English obvious", async ({ page }) => {
  await page.goto("/login")
  await expect(page.getByRole("heading", { name: /LOSPOR База данни/i })).toBeVisible()
  await expect(page.getByLabel("Имейл")).toBeVisible()
  await expect(page.getByLabel("Парола")).toBeVisible()
  await expect(page.getByRole("button", { name: "Вход" })).toBeVisible()

  await expect(page.getByRole("button", { name: "Български" })).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("button", { name: "English" }).click()
  await expect(page.getByRole("heading", { name: /LOSPOR Database/i })).toBeVisible()
  await expect(page.getByLabel("Email")).toBeVisible()
  await expect(page.getByLabel("Password")).toBeVisible()
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
})
