import { expect, test } from "@playwright/test"

// HOSPITAL_LOCALE_E2E_DEFAULT_BG
// HOSPITAL_LOCALE_E2E_VISIBLE_CHOICES

test("Bulgarian is the default and both languages are visible", async ({ page }) => {
  await page.goto("/login")
  await expect(page.getByRole("button", { name: "Вход" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Български" })).toBeVisible()
  await expect(page.getByRole("button", { name: "English" })).toBeVisible()
})

test("shows the standalone database sign-in experience", async ({ page }) => {
  await page.goto("/login")
  await page.getByRole("button", { name: "English" }).click()
  await expect(page.getByRole("heading", { name: /LOSPOR Database/i })).toBeVisible()
  await expect(page.getByLabel("Email")).toBeVisible()
  await expect(page.getByLabel("Password")).toBeVisible()
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
})
