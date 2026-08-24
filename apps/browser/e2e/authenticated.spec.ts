import { expect, test, type Page } from "@playwright/test"
import { E2E_EMAIL, E2E_PASSWORD, E2E_RESEARCH_EMAIL } from "./credentials"

async function signIn(page: Page, email: string, callbackUrl = "/overview") {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
  await page.getByRole("button", { name: "English" }).click()
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(E2E_PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  // Generously, because the first sign-in of a run is also the first request
  // for /overview, and the dev server compiles that route on demand. At the
  // default five seconds the first test in the suite failed while every repeat
  // of the same test passed — which reads as a broken login rather than a
  // build still finishing.
  await expect(page).toHaveURL(new RegExp(`${callbackUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), { timeout: 60_000 })
  if (callbackUrl === "/overview") {
    await expect(page.getByRole("heading", { name: "Research overview" }))
      .toBeVisible({ timeout: 30_000 })
  }
}

test("returns to the validated research page after sign-in", async ({ page, isMobile }) => {
  test.skip(isMobile, "Authenticated policy flow runs once in the desktop project")
  await signIn(page, E2E_EMAIL, "/cohorts")
  await expect(page.getByRole("heading", { name: "Cohort builder" })).toBeVisible()
})

test("cohort owner can edit metadata and delete the saved cohort", async ({ page, isMobile }) => {
  test.skip(isMobile, "Authenticated cohort lifecycle runs once in the desktop project")
  await signIn(page, E2E_EMAIL, "/cohorts")

  const suffix = Date.now().toString(36)
  const originalName = `E2E cohort ${suffix}`
  const editedName = `${originalName} edited`
  await page.getByLabel("Cohort name").fill(originalName)
  await page.getByRole("button", { name: "Save cohort" }).click()

  const originalRow = page.getByRole("row").filter({ hasText: originalName })
  await expect(originalRow).toBeVisible()
  await originalRow.getByTitle("Edit").click()
  const editForm = page.getByRole("form", { name: "Edit saved cohort" })
  await editForm.getByLabel("Name").fill(editedName)
  await editForm.getByLabel("Description").fill("Edited by the Browser E2E lifecycle")
  await editForm.getByRole("button", { name: "Save changes" }).click()

  const editedRow = page.getByRole("row").filter({ hasText: editedName })
  await expect(editedRow).toContainText("Edited by the Browser E2E lifecycle")
  await editedRow.getByTitle("Edit cohort filters").click()
  await page.getByRole("group", { name: "Finalized from" }).locator("input").fill("2026-01-03")
  await page.getByRole("button", { name: "Save changes" }).click()

  const refreshedRow = page.getByRole("row").filter({ hasText: editedName })
  await refreshedRow.getByTitle("Edit cohort filters").click()
  await expect(page.getByRole("group", { name: "Finalized from" }).locator("input"))
    .toHaveValue("2026-01-03")
  await page.getByRole("button", { name: "Cancel" }).click()
  page.once("dialog", dialog => dialog.accept())
  await refreshedRow.getByTitle("Delete").click()
  await expect(page.getByRole("row").filter({ hasText: editedName })).toHaveCount(0)
})

test("does not pretend sign-out succeeded when revocation fails", async ({ page, isMobile }) => {
  test.skip(isMobile, "Authenticated policy flow runs once in the desktop project")
  await signIn(page, E2E_EMAIL)
  await page.route("**/api/auth/session", async route => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 503, body: "unavailable" })
      return
    }
    await route.continue()
  })
  await page.getByTitle("Sign out").click()
  await expect(page.getByRole("alert")).toContainText("Could not sign out")
  await expect(page).toHaveURL(/\/overview$/)
})

test("confirmed sign-out leaves no usable cookie session", async ({ page, isMobile }) => {
  test.skip(isMobile, "Authenticated policy flow runs once in the desktop project")
  await signIn(page, E2E_EMAIL)
  await page.getByTitle("Sign out").click()
  await expect(page).toHaveURL(/\/login$/)
  const session = await page.request.get("/api/auth/session")
  expect(session.status()).toBe(401)
})

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
