import { expect, test, type Page } from "@playwright/test"
import { E2E_EMAIL, E2E_PASSWORD, E2E_RESEARCH_EMAIL } from "./credentials"

async function signIn(page: Page, email: string) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(E2E_PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/overview$/)
  await expect(page.getByRole("heading", { name: "Research overview" })).toBeVisible()
}

test("admin can navigate authenticated case and export surfaces", async ({ page, isMobile }) => {
  test.skip(isMobile, "Authenticated policy flow runs once in the desktop project")
  await signIn(page, E2E_EMAIL)

  await expect(page.getByRole("link", { name: "Cases", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Exports", exact: true })).toBeVisible()

  await page.getByRole("link", { name: "Cases", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Pseudonymous cases" })).toBeVisible()
  await page.getByRole("link", { name: "Exports", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Governed exports" })).toBeVisible()
})

test("aggregate-only researcher cannot inspect cases or export", async ({ page, isMobile }) => {
  test.skip(isMobile, "Authenticated policy flow runs once in the desktop project")
  await signIn(page, E2E_RESEARCH_EMAIL)

  await expect(page.getByRole("link", { name: "Cases", exact: true })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Exports", exact: true })).toHaveCount(0)

  await page.getByRole("link", { name: "Cohort builder", exact: true }).click()
  await page.getByRole("button", { name: "Run query" }).click()
  await expect(page.getByText("Aggregate results only. Your grant does not permit case-level inspection.")).toBeVisible()

  await page.goto("/cases")
  await expect(page).toHaveURL(/\/access-denied$/)
  await expect(page.getByRole("heading", { name: "Research access required" })).toBeVisible()
})
