import path from "path"
import { test, expect, type Page } from "@playwright/test"
import { contextFor, JSON_HEADERS } from "./roles"

// Every web drug-selection menu, opened and photographed, for a person to
// check their colours (10.0.0). Only runs with DRUG_SHOTS_DIR set; the theme
// is THEME (dark by default).

const DIR = process.env.DRUG_SHOTS_DIR
const THEME = process.env.THEME === "light" ? "light" : "dark"
test.skip(!DIR, "DRUG_SHOTS_DIR not set")
test.describe.configure({ timeout: 600_000 })

let n = 0
async function shot(page: Page, name: string) {
  await page.waitForTimeout(700)
  n += 1
  await page.screenshot({ path: path.join(DIR!, `${THEME}-${String(n).padStart(2, "0")}-${name}.png`) })
}
async function tryStep(label: string, step: () => Promise<void>) {
  try { await step() } catch (error) { console.log(`skipped ${label}: ${(error as Error).message.split("\n")[0]}`) }
}

test("drug menus", async ({ browser }) => {
  const context = await contextFor(browser, "member-a")
  await context.addCookies([{ name: "theme", value: THEME, url: "http://localhost:3000" }])
  await context.addInitScript(theme => {
    localStorage.setItem("theme", theme)
    localStorage.setItem("tourCompleted", "1")
    localStorage.setItem("caseSidebar", "off")
    localStorage.setItem("layoutMode", "tabs")
  }, THEME)
  const page = await context.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const startedAt = new Date(Date.now() - 20 * 60_000)
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false }).format(startedAt)
  const created = await context.request.post("/api/cases", {
    headers: JSON_HEADERS,
    data: {
      patientNumber: `DRUG-MENUS-E2E-${Date.now()}`,
      preop: { ageYears: 45, sex: "FEMALE", heightCm: 165, weightKg: 68, clinicalMode: "ADULT" },
      intraop: { startTime: local, startedAt: startedAt.toISOString(), timezone: zone, techniques: ["GENERAL_BALANCED"] },
    },
  })
  expect(created.status(), await created.text()).toBe(201)
  const { id } = await created.json()
  // A charted case, for the drugs' colours on the chart (10.0.0). The
  // Remifentanil infusion is saved in an old colour: the chart shows the
  // colour in use, not the saved one.
  const at = (min: number) => new Date(Date.now() + min * 60_000).toISOString()
  for (const event of [
    { type: "drug", ts: at(-18), name: "Propofol", dose: "150", unit: "mg" },
    { type: "drug", ts: at(-18), name: "Fentanyl", dose: "100", unit: "mcg" },
    { type: "drug", ts: at(-17), name: "Rocuronium", dose: "50", unit: "mg" },
    { type: "drug", ts: at(-12), name: "Ondansetron", dose: "4", unit: "mg" },
    { type: "infusion_start", ts: at(-16), infId: "inf-remi", name: "Remifentanil", rate: "0.15", unit: "mcg/kg/min", color: "#3b82f6" },
    { type: "infusion_start", ts: at(-14), infId: "inf-nor", name: "Norepinephrine / Noradrenaline", rate: "0.05", unit: "mcg/kg/min", color: "#ef4444" },
  ]) {
    const posted = await context.request.post(`/api/cases/${id}/events`, { headers: JSON_HEADERS, data: event })
    expect(posted.ok(), await posted.text()).toBeTruthy()
  }

  const openChart = async () => {
    await page.goto(`/cases/new?continue=${id}&step=1`, { waitUntil: "domcontentloaded" })
    const tab = page.getByRole("tab", { name: "Chart" })
    if (await tab.waitFor({ state: "visible", timeout: 20_000 }).then(() => true, () => false)) await tab.click()
    const chart = page.locator('[data-tour="intraop-timetable"]')
    await expect(chart).toBeVisible({ timeout: 60_000 })
    return chart
  }
  const escape = async () => { await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(300) }

  try {
    let chart = await openChart()
    await chart.scrollIntoViewIfNeeded()
    await page.waitForTimeout(1500)
    n += 1
    await chart.screenshot({ path: path.join(DIR!, `${THEME}-${String(n).padStart(2, "0")}-chart-colours.png`) })

    // Bolus drugs: the picker, a category, the dose flyout.
    await tryStep("bolus", async () => {
      await chart.getByTestId("add-drug").first().click()
      await shot(page, "bolus-picker")
      // The picker opens on categories: into one, then a drug.
      await page.getByRole("button", { name: /^Induction/ }).first().click({ timeout: 10_000 })
      await shot(page, "bolus-drugs")
      await page.getByRole("button", { name: /^Propofol/ }).first().click({ timeout: 10_000 })
      await shot(page, "bolus-dose")
      await escape()
    })

    // Infusions: the menu, browse all, the dose fields, then a running bar's menu.
    await tryStep("infusion", async () => {
      chart = await openChart()
      await chart.getByTestId("add-infusion").nth(2).click()
      await shot(page, "infusion-menu")
      await page.getByRole("button", { name: "Browse all infusions" }).click({ timeout: 10_000 })
      await shot(page, "infusion-browse")
      await page.getByPlaceholder("Search infusion").fill("Remifentanil")
      await page.getByRole("button", { name: /^Remifentanil/ }).first().click({ timeout: 10_000 })
      await shot(page, "infusion-dose")
      await page.getByRole("button", { name: "Start Infusion" }).click({ timeout: 10_000 })
      await page.waitForTimeout(1500)
      await chart.getByText("infusion", { exact: true }).first().click({ timeout: 10_000 })
      await shot(page, "infusion-bar-menu")
      await escape()
    })

    // Fluids.
    await tryStep("fluid", async () => {
      chart = await openChart()
      await chart.getByTestId("add-fluid").nth(2).click()
      await shot(page, "fluid-picker")
      await escape()
    })

    // Volatile agent and gas settings (balanced GA has the lanes).
    await tryStep("agent", async () => {
      chart = await openChart()
      await chart.locator("[data-agent-cell]").nth(2).click()
      await shot(page, "agent-picker")
      await escape()
    })

    // Premedication on the intraop record.
    await tryStep("premedication", async () => {
      await page.goto(`/cases/new?continue=${id}&step=1`, { waitUntil: "domcontentloaded" })
      const tab = page.getByRole("tab", { name: "Anaesthesia" })
      if (await tab.waitFor({ state: "visible", timeout: 20_000 }).then(() => true, () => false)) await tab.click()
      await page.getByText("Premedication", { exact: true }).first().click()
      await page.getByTestId("premedication-evening").locator("button").first().click({ timeout: 10_000 })
      await shot(page, "premed-categories")
      await page.locator("button").filter({ hasText: /Benzodiazepines|Sedatives|Anxiolytics/i }).first().click({ timeout: 10_000 })
      await shot(page, "premed-drugs")
      await escape()
    })

    // Premedication ordered at the preop visit.
    await tryStep("preop premedication order", async () => {
      await page.goto(`/cases/new?continue=${id}&step=0`, { waitUntil: "domcontentloaded" })
      const night = page.getByTestId("preop-premedication-night")
      await night.scrollIntoViewIfNeeded({ timeout: 30_000 })
      await night.locator("button").first().click()
      await shot(page, "preop-premed-order")
      await escape()
    })

    // Current medications search on preop.
    await tryStep("current medications", async () => {
      const meds = page.locator("#preop-sec-medications input").first()
      await meds.scrollIntoViewIfNeeded({ timeout: 20_000 })
      await meds.fill("metop")
      await page.waitForTimeout(1500)
      await shot(page, "preop-current-meds-search")
      await escape()
    })
  } finally {
    await page.goto("about:blank")
    await context.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS })
    await context.close()
  }
})
