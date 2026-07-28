import { test, expect } from "@playwright/test"

// Authenticated clinical-data lifecycle against the DEV database, exercising the
// real endpoints the UI uses (session comes from auth.setup.ts via storageState):
//   create case (API) → case detail renders (UI) → delete (API cleanup) → 404.
// Self-cleaning so the dev DB stays tidy; never touches live (separate project).

// Cookie-auth writes are CSRF-guarded (Origin must equal the app origin); the
// API request context doesn't send a browser Origin, so set it explicitly to
// match the dev server's NEXTAUTH_URL (localhost, per playwright.config webServer).
const ORIGIN = "http://localhost:3000"

test("case lifecycle: create → view in UI → delete", async ({ page }) => {
  const create = await page.request.post("/api/cases", {
    headers: { Origin: ORIGIN },
    data: { preop: { ageYears: 41, sex: "MALE", heightCm: 178, weightKg: 82 } },
  })
  expect(create.ok(), `create failed: ${create.status()}`).toBeTruthy()
  const { id, caseCode } = await create.json()
  expect(id).toBeTruthy()

  try {
    // UI: the authenticated case-detail page renders this case (not redirected to login)
    await page.goto(`/cases/${id}`)
    await expect(page).not.toHaveURL(/\/login/)
    if (caseCode) {
      await expect(page.getByText(String(caseCode), { exact: false }).first()).toBeVisible({ timeout: 10_000 })
    }

    // API: the case is fetchable while it exists
    const got = await page.request.get(`/api/cases/${id}`)
    expect(got.ok()).toBeTruthy()
  } finally {
    const del = await page.request.delete(`/api/cases/${id}`, { headers: { Origin: ORIGIN } })
    expect(del.ok(), `cleanup delete failed: ${del.status()}`).toBeTruthy()
  }

  // Verify cleanup actually removed it
  const after = await page.request.get(`/api/cases/${id}`)
  expect(after.status()).toBe(404)
})
