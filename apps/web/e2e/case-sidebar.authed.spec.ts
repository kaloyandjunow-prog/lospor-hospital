import { test, expect } from "@playwright/test"
import { contextFor, JSON_HEADERS } from "./roles"

// One case panel beside preop, intraop and postop (10.0.0): it stays as the
// case moves on, keeps the allergy in view, and opens an earlier step. Without
// it, each screen is sectioned or scrollable on its own.

const PREOP = {
  ageYears: 52, sex: "FEMALE" as const, heightCm: 168, weightKg: 70,
  allergies: true, allergyDetails: [{ label: "Penicillin" }],
  diagnoses: [{ label: "Cholelithiasis" }], procedures: [{ label: "Laparoscopic cholecystectomy" }],
}

test("the sidebar follows the case from intraop to postop and back to preop", async ({ browser }) => {
  const context = await contextFor(browser, "member-a")
  const page = await context.newPage()
  const api = context.request
  await page.addInitScript(() => {
    window.localStorage.setItem("caseSidebar", "on")
    window.localStorage.setItem("tourCompleted", "1")
  })
  const created = await api.post("/api/cases", { headers: JSON_HEADERS, data: { preop: PREOP } })
  expect(created.status(), await created.text()).toBe(201)
  const { id } = await created.json()
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/cases/new?continue=${id}&step=1`)
    const intraop = page.getByTestId("intraop-sidebar")
    await expect(intraop).toBeVisible({ timeout: 30_000 })
    await expect(intraop.getByTestId("sidebar-allergy")).toContainText("Penicillin")
    await expect(intraop.getByTestId("sidebar-stages").getByRole("button", { name: /Intraop/ })).toHaveAttribute("aria-current", "step")
    // Technique is needed to finalise and not chosen yet.
    await expect(intraop.getByRole("button", { name: /Anaesthesia/ }).locator(".bg-red-500")).toHaveCount(1)
    // The chart is on the same page, beside the panel.
    await expect(page.locator("#intraop-sec-chart")).toBeVisible()
    // For a person to look at: SIDEBAR_SHOTS_DIR=<dir>.
    if (process.env.SIDEBAR_SHOTS_DIR) await page.screenshot({ path: `${process.env.SIDEBAR_SHOTS_DIR}/intraop-sidebar.png` })

    await page.goto(`/cases/new?continue=${id}&step=2`)
    const postop = page.getByTestId("postop-sidebar")
    await expect(postop).toBeVisible({ timeout: 30_000 })
    await expect(postop.getByTestId("sidebar-allergy")).toContainText("Penicillin")
    if (process.env.SIDEBAR_SHOTS_DIR) await page.screenshot({ path: `${process.env.SIDEBAR_SHOTS_DIR}/postop-sidebar.png` })

    // Once the step has finished loading: a click while the case is still being read is overtaken by it.
    await page.waitForLoadState("networkidle").catch(() => {})
    await postop.getByTestId("sidebar-stages").getByRole("button", { name: /Preop/ }).click()
    await expect(page.getByTestId("preop-sidebar")).toBeVisible()
  } finally {
    await api.delete(`/api/cases/${id}`, { headers: JSON_HEADERS })
    await context.close()
  }
})

test("without the sidebar each screen takes its own layout, and the preop tabs have Plan & orders", async ({ browser }) => {
  const context = await contextFor(browser, "member-a")
  const page = await context.newPage()
  const api = context.request
  await page.addInitScript(() => {
    window.localStorage.setItem("caseSidebar", "off")
    window.localStorage.setItem("preopLayout", "tabs")
    window.localStorage.setItem("postopLayout", "scroll")
    window.localStorage.setItem("tourCompleted", "1")
  })
  const created = await api.post("/api/cases", { headers: JSON_HEADERS, data: { preop: PREOP } })
  expect(created.status(), await created.text()).toBe(201)
  const { id } = await created.json()
  try {
    await page.goto(`/cases/new?continue=${id}`)
    await expect(page.getByRole("tab", { name: "Plan & orders" })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId("preop-sidebar")).toHaveCount(0)
    await page.getByRole("tab", { name: "Plan & orders" }).click()
    await expect(page.locator("#preop-sec-notes")).toBeVisible()

    await page.goto(`/cases/new?continue=${id}&step=2`)
    await expect(page.getByTestId("postop-section-strip")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId("postop-sidebar")).toHaveCount(0)
    await expect(page.getByTestId("postop-tabs")).toHaveCount(0)
  } finally {
    await api.delete(`/api/cases/${id}`, { headers: JSON_HEADERS })
    await context.close()
  }
})
