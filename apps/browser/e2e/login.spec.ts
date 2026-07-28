import { expect, test } from "@playwright/test"

test("shows the standalone database sign-in experience", async ({ page }) => {
  await page.goto("/login")
  await expect(page.getByRole("heading", { name: /LOSPOR Database/i })).toBeVisible()
  await expect(page.getByLabel("Email")).toBeVisible()
  await expect(page.getByLabel("Password")).toBeVisible()
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
})
