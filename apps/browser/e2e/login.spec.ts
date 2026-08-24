import { expect, test } from "@playwright/test"

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
