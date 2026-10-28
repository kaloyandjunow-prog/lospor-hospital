import { test, expect, type Page } from "@playwright/test"

/**
 * What a finger can do on the web chart that a mouse and keyboard already could
 * (10.0.0). Each check is made against the saved log, not only the screen.
 *
 * - "Continue?" after a stopped agent: one tap only shows it, a second records.
 *   Before, a single invisible tap recorded a new administration.
 * - Undo and redo as buttons (a finger has no Ctrl+Z).
 * - A running infusion entered in error is removed from its menu.
 * - A stopped agent is resumed from its editor (was a double-click only).
 * - A tap on a drug opens its dose; a tap on a vitals cell opens the stepper.
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

test("continuing a stopped agent takes two taps, and Undo takes it back", async ({ page }) => {
  const id = await seed(page, stoppedSevo)
  try {
    const chart = await openChart(page, id)
    const starts = async () => (await log(page, id)).filter(e => e.type === "agent_start").length
    const offer = chart.getByTestId("agent-continue").nth(2)
    await offer.tap()
    await page.waitForTimeout(1500)
    expect(await starts(), "one tap only shows the offer").toBe(1)
    await expect(offer).toHaveAttribute("data-armed", "true")
    await offer.tap()
    await expect.poll(starts, { timeout: 15_000 }).toBe(2)

    await page.getByTestId("timetable-undo").tap()
    await expect.poll(starts, { timeout: 15_000 }).toBe(1)
    await page.getByTestId("timetable-redo").tap()
    await expect.poll(starts, { timeout: 15_000 }).toBe(2)
  } finally { await page.request.delete(`/api/cases/${id}`, { headers: { Origin: ORIGIN } }) }
})

test("a stopped agent is resumed from its editor", async ({ page }) => {
  const id = await seed(page, stoppedSevo)
  try {
    const chart = await openChart(page, id)
    // The bar's own name does not take taps; its strip opens the same editor.
    await chart.getByTestId("agent-percent-strip").first().tap()
    await page.getByTestId("agent-resume").tap({ timeout: 10_000 })
    await expect.poll(async () => (await log(page, id)).filter(e => e.type === "agent_stop").length, { timeout: 15_000 }).toBe(0)
  } finally { await page.request.delete(`/api/cases/${id}`, { headers: { Origin: ORIGIN } }) }
})

test("a running infusion entered in error is removed from its menu, after the question", async ({ page }) => {
  const id = await seed(page, at => [
    { type: "infusion_start", ts: at(-30), infId: "inf-p", name: "Propofol", rate: "5", unit: "mg/kg/h", color: "#3b82f6" },
  ])
  try {
    const chart = await openChart(page, id)
    await chart.locator('[data-testid="infusion-lane"] [aria-label="Propofol"]').first().tap()
    await page.getByTestId("infusion-remove").tap()
    await page.getByRole("button", { name: /^(Delete|Remove|Confirm|Yes)/ }).last().tap()
    await expect.poll(async () => (await log(page, id)).filter(e => e.type.startsWith("infusion_")).length, { timeout: 15_000 }).toBe(0)
  } finally { await page.request.delete(`/api/cases/${id}`, { headers: { Origin: ORIGIN } }) }
})

test("a tap on a drug opens its dose, and a tap on a vitals cell opens the stepper", async ({ page }) => {
  const id = await seed(page, at => [
    { type: "drug", ts: at(-20), name: "Fentanyl", dose: "100", unit: "mcg" },
  ])
  try {
    const chart = await openChart(page, id)
    await chart.getByText("Fentanyl").first().tap()
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
