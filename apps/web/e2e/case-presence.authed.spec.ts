import { test, expect } from "@playwright/test"

/**
 * Who has a case open (10.8.0): with a second screen on the same case, each says "Case open by: ..." with the
 * people's names; alone, nothing is said. It is a notice only: both screens can chart.
 */
const ORIGIN = process.env.E2E_BASE_URL ?? "http://localhost:3300"
test.describe.configure({ timeout: 120_000 })

test("a second screen on a case makes both say who has it open", async ({ page, browser }) => {
  const created = await page.request.post("/api/cases", { headers: { Origin: ORIGIN }, data: { patientNumber: `CASE-PRESENCE-E2E-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, preop: { ageYears: 41, sex: "MALE", heightCm: 178, weightKg: 82, clinicalMode: "ADULT" } } })
  expect(created.ok()).toBeTruthy()
  const { id } = await created.json() as { id: string }
  const second = await browser.newContext({ storageState: "e2e/.auth/user.json" })
  const other = await second.newPage()
  try {
    await page.goto(`/cases/new?continue=${id}`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(4_000)
    await expect(page.getByTestId("case-presence"), "alone: nothing is said").toHaveCount(0)

    await other.goto(`/cases/new?continue=${id}`, { waitUntil: "domcontentloaded" })
    await expect(other.getByTestId("case-presence")).toContainText(/Case open by: .+\(you\)/, { timeout: 30_000 })
    // The first screen hears of the second at its next report (every 20 s).
    await expect(page.getByTestId("case-presence")).toContainText("Case open by:", { timeout: 40_000 })

    // Closing the second screen leaves the case: the first goes quiet again.
    await other.goto("about:blank")
    await expect(page.getByTestId("case-presence")).toHaveCount(0, { timeout: 40_000 })
  } finally {
    await page.goto("about:blank")
    await second.close()
    await page.request.delete(`/api/cases/${id}`, { headers: { Origin: ORIGIN } })
  }
})
