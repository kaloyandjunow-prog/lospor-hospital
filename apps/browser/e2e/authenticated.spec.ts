import { expect, test, type Page } from "@playwright/test"
import { E2E_EMAIL, E2E_PASSWORD, E2E_RESEARCH_EMAIL } from "./credentials"

async function signIn(page: Page, email: string) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(E2E_PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  // Generously, because the first sign-in of a run is also the first request
  // for /overview, and the dev server compiles that route on demand. At the
  // default five seconds the first test in the suite failed while every repeat
  // of the same test passed — which reads as a broken login rather than a
  // build still finishing.
  await expect(page).toHaveURL(/\/overview$/, { timeout: 60_000 })
  await expect(page.getByRole("heading", { name: "Research overview" }))
    .toBeVisible({ timeout: 30_000 })
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
