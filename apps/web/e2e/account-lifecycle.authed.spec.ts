import { expect, test } from "@playwright/test"
import { E2E_MEMBER_A_EMAIL } from "./credentials"
import { contextFor } from "./roles"

test("a clinician can review their governed profile and active sessions", async ({ browser }) => {
  const context = await contextFor(browser, "member-a")
  const page = await context.newPage()
  try {
    await page.goto("/account")
    await expect(page).toHaveURL(/\/account/)
    await expect(page.getByRole("heading", { name: /My account|Моят акаунт/ })).toBeVisible()
    // The address is shown read-only — it is governed, not edited here — so it
    // is a plain field with a stable id rather than a type="email" control.
    await expect(page.locator("#account-email")).toHaveValue(E2E_MEMBER_A_EMAIL)
    await expect(page.getByText(/This device|Това устройство/)).toBeVisible()
    await expect(page.getByRole("button", { name: /Change password|Смени паролата/ })).toBeVisible()
  } finally {
    await context.close()
  }
})

test("Cloud Demo fails closed and does not expose Hospital lifecycle controls", async ({ browser }) => {
  const context = await contextFor(browser, "admin")
  const page = await context.newPage()
  try {
    await page.goto("/admin")
    await expect(page.getByText(/Requests to join a department|Заявки за присъединяване към отделение/))
      .toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/Hospital account controls|Управление на болнични акаунти/)).toHaveCount(0)
    await expect(page.getByRole("button", { name: /Suspend|Спри достъпа/ })).toHaveCount(0)
    await expect(page.getByRole("button", { name: /Restore account|Възстанови акаунта/ })).toHaveCount(0)
  } finally {
    await context.close()
  }
})
