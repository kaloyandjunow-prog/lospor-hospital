import { test, expect, type Page } from "@playwright/test"

/**
 * What a finger does on the web chart (10.0.0, reworked 10.8.0). Each check is made against the saved log.
 *
 * - The first tap on a cell only highlights it; the second opens the chart's one menu.
 * - Continue (a stopped agent), Delete whole (an infusion entered in error): from that menu, no question.
 * - Undo and redo as buttons (a finger has no Ctrl+Z), and the Undo bar.
 * - A tap on a drug opens its menu (Edit opens the dose); a tap on a vitals cell opens the stepper.
 */

const ORIGIN = "http://localhost:3000"
test.use({ hasTouch: true, viewport: { width: 1180, height: 820 } })
test.describe.configure({ timeout: 120_000 })

type Log = Array<{ id: string; type: string; name?: string; ts: string }>
const log = async (page: Page, id: string) => ((await (await page.request.get(`/api/cases/${id}`)).json()).intraop?.keyEvents?.log ?? []) as Log
const post = (page: Page, id: string, data: Record<string, unknown>) => page.request.post(`/api/cases/${id}/events`, { headers: { Origin: ORIGIN }, data })

async function seed(page: Page, events: (at: (min: number) => string) => Record<string, unknown>[]) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const now = Date.now()
  const at = (min: number) => new Date(now + min * 60_000).toISOString()
  const startedAt = new Date(now - 40 * 60_000)
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false }).format(startedAt)
  const id = (await (await page.request.post("/api/cases", { headers: { Origin: ORIGIN }, data: {
    patientNumber: `INTRAOP-TOUCH-E2E-${Date.now()}`,
    preop: { ageYears: 41, sex: "MALE", heightCm: 178, weightKg: 82, clinicalMode: "ADULT" },
    intraop: { startTime: local, startedAt: startedAt.toISOString(), timezone: zone, techniques: ["GENERAL_INHALATION"] },
  } })).json()).id as string
  for (const event of events(at)) expect((await post(page, id, event)).ok()).toBeTruthy()
  return id
}

async function openChart(page: Page, id: string) {
  await page.goto(`/cases/new?continue=${id}&step=1`, { waitUntil: "domcontentloaded" })
  const tab = page.getByRole("tab", { name: "Chart" })
  if (await tab.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false)) await tab.click()
  const chart = page.locator('[data-tour="intraop-timetable"]')
  await expect(chart).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(1500)
  return chart
}

const stoppedSevo = (at: (min: number) => string) => [
  { type: "agent_start", ts: at(-35), name: "Sevoflurane", value: "2", agentMode: "concurrent" },
  { type: "agent_stop", ts: at(-25), name: "Sevoflurane" },
]

/** Two taps on a cell: the first highlights, the second opens the menu. */
async function tapTwice(target: ReturnType<Page["locator"]>) {
  await target.tap()
  await expect(target).toHaveAttribute("data-tt-armed", "")
  await target.tap()
}

test("continuing a stopped agent: two taps open the menu, Continue writes a new start, Undo takes it back", async ({ page }) => {
  const id = await seed(page, stoppedSevo)
  try {
    const chart = await openChart(page, id)
    const starts = async () => (await log(page, id)).filter(e => e.type === "agent_start").length
    const cell = chart.locator("[data-agent-cell]").nth(5)
    await cell.tap()
    await page.waitForTimeout(800)
    await expect(page.getByTestId("timetable-cell-menu"), "one tap only highlights").toHaveCount(0)
    expect(await starts()).toBe(1)
    await cell.tap()
    await page.getByTestId("cell-menu-resume").tap()
    // Continue puts the agent back to running: a new start, or the stop taken away.
    const stops = async () => (await log(page, id)).filter(e => e.type === "agent_stop").length
    const running = async () => (await starts()) === 2 || (await stops()) === 0
    await expect.poll(running, { timeout: 15_000 }).toBe(true)

    await page.getByTestId("timetable-undo").tap()
    await expect.poll(async () => !(await running()), { timeout: 15_000 }).toBe(true)
    await page.getByTestId("timetable-redo").tap()
    await expect.poll(running, { timeout: 15_000 }).toBe(true)
  } finally { await page.request.delete(`/api/cases/${id}`, { headers: { Origin: ORIGIN } }) }
})

test("the Undo bar takes back a stop", async ({ page }) => {
  const id = await seed(page, at => [{ type: "agent_start", ts: at(-35), name: "Sevoflurane", value: "2", agentMode: "concurrent" }])
  try {
    const chart = await openChart(page, id)
    const stops = async () => (await log(page, id)).filter(e => e.type === "agent_stop").length
    await tapTwice(chart.locator("[data-agent-cell]").nth(3))
    await page.getByTestId("cell-menu-stop").tap()
    await expect.poll(stops, { timeout: 15_000 }).toBe(1)
    await page.getByTestId("timetable-undo-bar-undo").tap()
    await expect.poll(stops, { timeout: 15_000 }).toBe(0)
  } finally { await page.request.delete(`/api/cases/${id}`, { headers: { Origin: ORIGIN } }) }
})

test("a running infusion entered in error is deleted from its menu, with no question", async ({ page }) => {
  const id = await seed(page, at => [
    { type: "infusion_start", ts: at(-30), infId: "inf-p", name: "Propofol", rate: "5", unit: "mg/kg/h", color: "#3b82f6" },
  ])
  try {
    const chart = await openChart(page, id)
    await tapTwice(chart.getByTestId("infusion-lane").locator("[data-tt-cell]").nth(3))
    await page.getByTestId("cell-menu-delete_whole").tap()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
    await expect.poll(async () => (await log(page, id)).filter(e => e.type.startsWith("infusion_")).length, { timeout: 15_000 }).toBe(0)
  } finally { await page.request.delete(`/api/cases/${id}`, { headers: { Origin: ORIGIN } }) }
})

test("a tap on a drug opens its menu, Edit opens the dose, and a tap on a vitals cell opens the stepper", async ({ page }) => {
  const id = await seed(page, at => [
    { type: "drug", ts: at(-20), name: "Fentanyl", dose: "100", unit: "mcg" },
  ])
  try {
    const chart = await openChart(page, id)
    await tapTwice(chart.locator("[data-tt-point]").first())
    await page.getByTestId("cell-menu-edit").tap()
    await expect(page.locator('input[value="100"]').first()).toBeVisible()
    await page.keyboard.press("Escape")
    await page.mouse.click(5, 5)
    await page.waitForTimeout(500)

    const cell = chart.locator('input[placeholder="."]').nth(3)
    await cell.tap()
    await expect(page.locator('input[type="range"]').first()).toBeVisible()
    // On a touch screen the cell asks for no on-screen keyboard.
    await expect(cell).toHaveAttribute("inputmode", "none")
  } finally { await page.request.delete(`/api/cases/${id}`, { headers: { Origin: ORIGIN } }) }
})
