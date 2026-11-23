import { test, expect, type Page, type Locator } from "@playwright/test"
import path from "path"

/**
 * What a bar ran at, over time, on the web chart (10.0.0).
 *
 * Agents and rate-mode fluids show each value in a strip above the bar, as
 * infusions do; a change planned for later shows its value beside its marker
 * and is not a second bar; the agent editor opened on a later column records a
 * new concentration from there; and a strip travels with its bar while the bar
 * is dragged. Each step is checked in the saved log, not only on screen.
 */

const ORIGIN = "http://localhost:3000"
const SHOTS = process.env.SHOTS_DIR ?? path.join(__dirname, "..", "test-results", "change-strip-shots")
test.describe.configure({ timeout: 180_000 })
test.use({ deviceScaleFactor: 2 })

type LogEntry = { id: string; type: string; name?: string; ts: string; value?: string; rate?: string }
const created: string[] = []

test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1600, height: 1100 }) })
test.afterEach(async ({ page }) => {
  await page.goto("about:blank")
  for (const id of created.splice(0)) await page.request.delete(`/api/cases/${id}`, { headers: { Origin: ORIGIN } })
})

async function post(page: Page, id: string, event: Record<string, unknown>) {
  const res = await page.request.post(`/api/cases/${id}/events`, { headers: { Origin: ORIGIN }, data: event })
  expect(res.ok(), `${event.type}: ${res.status()} ${await res.text()}`).toBeTruthy()
}

/** A case started 30 minutes ago with an infusion, a rate-mode fluid and sevoflurane, each changed once and with a change planned ahead. */
async function seed(page: Page) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const now = Date.now()
  const at = (min: number) => new Date(now + min * 60_000).toISOString()
  const startedAt = new Date(now - 30 * 60_000)
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false }).format(startedAt)
  const create = await page.request.post("/api/cases", {
    headers: { Origin: ORIGIN },
    data: {
      preop: { ageYears: 41, sex: "MALE", heightCm: 178, weightKg: 82, clinicalMode: "ADULT" },
      intraop: { startTime: local, startedAt: startedAt.toISOString(), timezone: zone, techniques: ["GENERAL_INHALATION"] },
    },
  })
  const id = (await create.json()).id as string
  created.push(id)
  await post(page, id, { type: "infusion_start", ts: at(-20), infId: "inf-propofol", name: "Propofol", rate: "5", unit: "mg/kg/h", color: "#3b82f6" })
  await post(page, id, { type: "infusion_rate", ts: at(-10), infId: "inf-propofol", name: "Propofol", rate: "4", unit: "mg/kg/h" })
  await post(page, id, { type: "infusion_rate", ts: at(12), infId: "inf-propofol", name: "Propofol", rate: "3", unit: "mg/kg/h" })
  await post(page, id, { type: "fluid_start", ts: at(-20), fluidId: "fl-ringer", name: "Ringer", fluidEntryMode: "RATE", rate: "100", unit: "mL/h", color: "#22c55e", category: "CRYSTALLOID" })
  await post(page, id, { type: "fluid_rate", ts: at(-10), fluidId: "fl-ringer", name: "Ringer", fluidEntryMode: "RATE", rate: "150", unit: "mL/h" })
  await post(page, id, { type: "fluid_rate", ts: at(12), fluidId: "fl-ringer", name: "Ringer", fluidEntryMode: "RATE", rate: "250", unit: "mL/h" })
  await post(page, id, { type: "agent_start", ts: at(-20), name: "Sevoflurane", value: "2", color: "#a855f7", agentMode: "concurrent" })
  await post(page, id, { type: "agent_start", ts: at(-10), name: "Sevoflurane", value: "1.5", color: "#a855f7", agentMode: "concurrent" })
  await post(page, id, { type: "agent_start", ts: at(12), name: "Sevoflurane", value: "1", color: "#a855f7", agentMode: "concurrent" })
  return id
}

async function openChart(page: Page, id: string) {
  await page.goto(`/cases/new?continue=${id}&step=1`, { waitUntil: "domcontentloaded" })
  const tab = page.getByRole("tab", { name: "Chart" })
  if (await tab.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false)) await tab.click()
  const chart = page.locator('[data-tour="intraop-timetable"]')
  await expect(chart).toBeVisible({ timeout: 60_000 })
  await expect(chart.getByTestId("agent-percent-strip").first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1000)
  return chart
}

async function log(page: Page, id: string) {
  const body = await page.request.get(`/api/cases/${id}`).then(r => r.json())
  return (body?.intraop?.keyEvents?.log ?? []) as LogEntry[]
}

/** The lanes, cropped from the time header down, at twice the pixels. */
async function lanes(page: Page, name: string) {
  const top = (await page.getByText("Time", { exact: true }).first().boundingBox())!
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), clip: { x: 0, y: top.y - 8, width: 1600, height: 400 } })
}

/** Column `index` of the chart, as an x position (the agent row has one cell per column). */
async function colX(chart: Locator, index: number) {
  const box = (await chart.locator("[data-agent-cell]").nth(index).boundingBox())!
  return box.x + box.width / 2
}

/**
 * Presses on `from`, moves to column `toIndex` and stays there; the caller screenshots, then releases.
 * `grabX` is where to press, in pixels from the element's left edge (its middle when absent): a bar's middle can sit on a
 * rate-change marker or on a grip, which moves something else than the bar, depending on how wide the bar happens to be.
 */
async function startDrag(page: Page, chart: Locator, from: Locator, toIndex: number, grabX?: number) {
  await page.evaluate(() => {
    const w = window as unknown as { __dragStarted?: boolean; __dragListener?: boolean }
    w.__dragStarted = false
    if (!w.__dragListener) { w.__dragListener = true; document.addEventListener("dragstart", () => { w.__dragStarted = true }, true) }
  })
  const started = () => page.evaluate(() => (window as unknown as { __dragStarted?: boolean }).__dragStarted === true)
  let g!: { x: number; y: number; width: number; height: number }
  const target = await colX(chart, toIndex)
  for (let attempt = 0; attempt < 4; attempt++) {
    g = (await from.boundingBox())!
    const x = grabX == null ? g.x + g.width / 2 : g.x + grabX
    await page.mouse.move(x, g.y + g.height / 2)
    await page.mouse.down()
    await page.mouse.move(x + (target < g.x ? -8 : 8), g.y + g.height / 2, { steps: 4 })
    await page.waitForTimeout(150)
    if (await started()) break
    await page.mouse.up()
    await page.waitForTimeout(400)
  }
  expect(await started(), "the drag never started").toBe(true)
  const fromX = grabX == null ? g.x + g.width / 2 : g.x + grabX
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(fromX + (target - fromX) * i / 6, g.y + g.height / 2, { steps: 4 })
    await page.waitForTimeout(120)
  }
  await page.mouse.move(target + 2, g.y + g.height / 2, { steps: 2 })
  await page.waitForTimeout(600)
}

test("agents and rate fluids show each value in a strip; a planned change shows its value and is not a second bar", async ({ page }) => {
  const id = await seed(page)
  const chart = await openChart(page, id)
  await lanes(page, "1-strips-and-planned-changes")

  await expect(chart.getByTestId("agent-percent-strip").filter({ hasText: "2%" })).toHaveCount(1)
  await expect(chart.getByTestId("agent-percent-strip").filter({ hasText: "1.5%" })).toHaveCount(1)
  await expect(chart.getByTestId("fluid-rate-strip").filter({ hasText: "100 mL/h" })).toHaveCount(1)
  await expect(chart.getByTestId("fluid-rate-strip").filter({ hasText: "150 mL/h" })).toHaveCount(1)
  // One planned value each for the agent, the infusion and the fluid, written out.
  await expect(chart.getByTestId("planned-change-value")).toHaveText(["→ 1%", "→ 3 mg/kg/h", "→ 250 mL/h"])
  // The agent's name sits in the lane's own label (sticky), not inside its cells.
  await expect(chart.locator("[data-tt-label]").getByText("Sevoflurane", { exact: true }).first()).toBeVisible()
})

test("the agent editor opened on a later column records a new concentration from there", async ({ page }) => {
  const id = await seed(page)
  const chart = await openChart(page, id)
  // The column two before now (20 minutes after the start's column) is inside the 1.5% stretch.
  const strip = chart.getByTestId("agent-percent-strip").last()
  await strip.click()
  await page.getByTestId("cell-menu-change_dose").click()
  await expect(page.getByText(/^Change Sevoflurane from /)).toBeVisible()
  await page.locator('input[type="number"]').last().fill("0.8")
  await lanes(page, "2-agent-change-from-here")
  await page.getByRole("button", { name: /^Change from / }).click()
  await expect.poll(async () => (await log(page, id)).filter(e => e.type === "agent_start").sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)).map(e => e.value), { timeout: 15_000 })
    .toEqual(["2", "1.5", "0.8", "1"])
  // A change stamped at "now" reads as the next value ahead of its cell: shown either as a strip or as a planned value.
  await expect(chart.getByText("0.8%").first()).toBeVisible()
  await lanes(page, "3-agent-after-change")

  // On the start's cell the menu offers to fix the start (a wheel for the time), not a dose change.
  await chart.getByTestId("agent-percent-strip").filter({ hasText: "2%" }).first().click()
  await expect(page.getByTestId("cell-menu-fix_start")).toBeVisible()
})

// 10.8.0: a bar is not dragged as a whole any more; a rate fluid's end grip dragged back stops it there with no
// question (the volume is worked out from the rate; only a fluid entered as a bag asks how much of it ran).
test("a rate fluid's end grip dragged back stops it without a question", async ({ page }) => {
  const id = await seed(page)
  const chart = await openChart(page, id)
  const fluidGrip = chart.locator('div[draggable="true"].cursor-col-resize').last()
  await fluidGrip.evaluate(el => el.scrollIntoView({ block: "center" }))
  // Past the change planned for later (a stop cannot come before a later change of the same fluid): a planned stop.
  await startDrag(page, chart, fluidGrip, 10)
  await page.mouse.up()
  await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0)
  await expect.poll(async () => (await log(page, id)).filter(e => e.type === "fluid_end").length, { timeout: 15_000 }).toBeGreaterThan(0)
  await lanes(page, "4-fluid-end-after-drag")
})
