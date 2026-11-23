import { test, expect, type Page, type CDPSession } from "@playwright/test"
/**
 * A finger drags the web chart's bars (10.0.0). The chart's drags are the
 * browser's drag and drop, which a touch did not start at all; press, hold
 * and slide now does, and a quick swipe still scrolls. The end grip is drawn
 * again under the finger while it moves, so its lift has to be passed on or the
 * drag never drops (touch-drag.ts) -- the first test is the one that caught it.
 */
const ORIGIN = "http://localhost:3000"
test.use({ hasTouch: true, viewport: { width: 1180, height: 820 } })
test.describe.configure({ timeout: 120_000 })

type Log = Array<{ id: string; type: string; ts: string }>
async function seed(page: Page, stopped: boolean) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const now = Date.now()
  const startedAt = new Date(now - 40 * 60_000)
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false }).format(startedAt)
  const id = (await (await page.request.post("/api/cases", { headers: { Origin: ORIGIN }, data: {
    patientNumber: `INTRAOP-TOUCH-DRAG-E2E-${Date.now()}`,
    preop: { ageYears: 41, sex: "MALE", heightCm: 178, weightKg: 82, clinicalMode: "ADULT" },
    intraop: { startTime: local, startedAt: startedAt.toISOString(), timezone: zone, techniques: ["GENERAL_INHALATION"] },
  } })).json()).id as string
  await page.request.post(`/api/cases/${id}/events`, { headers: { Origin: ORIGIN }, data: { type: "infusion_start", ts: new Date(now - 30 * 60_000).toISOString(), infId: "inf-p", name: "Propofol", rate: "5", unit: "mg/kg/h", color: "#3b82f6" } })
  if (stopped) await page.request.post(`/api/cases/${id}/events`, { headers: { Origin: ORIGIN }, data: { type: "infusion_stop", ts: new Date(now - 15 * 60_000).toISOString(), infId: "inf-p", name: "Propofol" } })
  return id
}
const log = async (page: Page, id: string) => ((await (await page.request.get(`/api/cases/${id}`)).json()).intraop?.keyEvents?.log ?? []) as Log
async function open(page: Page, id: string) {
  await page.goto(`/cases/new?continue=${id}&step=1`, { waitUntil: "domcontentloaded" })
  const tab = page.getByRole("tab", { name: "Chart" })
  if (await tab.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false)) await tab.click()
  const chart = page.locator('[data-tour="intraop-timetable"]')
  await expect(chart).toBeVisible({ timeout: 60_000 })
  await expect(chart.locator('[data-touch-drag-ready="true"]')).toBeVisible({ timeout: 60_000 })
  return chart
}
async function finger(cdp: CDPSession, page: Page, x: number, y: number, dx: number, holdMs: number) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
  await page.waitForTimeout(holdMs)
  // Give the adapter's press-hold timer a scheduling window under a loaded CI
  // runner before the first move arrives. Short swipes do not use this pause.
  if (holdMs >= 400) await page.waitForTimeout(300)
  for (let i = 1; i <= 12; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx * i / 12, y }] }); await page.waitForTimeout(40) }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await page.waitForTimeout(2500)
}

test("hold and slide an end grip moves the end", async ({ page }) => {
  const id = await seed(page, true)
  try {
    const chart = await open(page, id)
    // The first tap highlights, the second opens the menu; closing it leaves the bar selected with its grips.
    const cell = chart.locator('[data-testid="infusion-lane"] [data-tt-cell]').nth(3)
    await cell.tap()
    await cell.tap()
    await page.keyboard.press("Escape")
    await page.waitForTimeout(400)
    const grip = chart.locator('[data-testid="infusion-lane"] div[draggable="true"].cursor-col-resize').last()
    const b = (await grip.boundingBox({ timeout: 10_000 }))!
    const before = (await log(page, id)).find(e => e.type === "infusion_stop")!.ts
    await finger(await page.context().newCDPSession(page), page, b.x + b.width / 2, b.y + b.height / 2, 160, 700)
    const after = (await log(page, id)).find(e => e.type === "infusion_stop")!.ts
    expect(Date.parse(after) - Date.parse(before)).toBeGreaterThan(0)
  } finally { await page.request.delete(`/api/cases/${id}`, { headers: { Origin: ORIGIN } }) }
})

// 10.8.0 (rule 6): a bar is not moved as a whole; a finger holding and sliding on it changes nothing.
test("hold and slide on a running bar changes nothing; a quick swipe does not either", async ({ page }) => {
  const id = await seed(page, false)
  try {
    const chart = await open(page, id)
    const lane = chart.getByTestId("infusion-lane").locator("[data-tt-cell]").nth(4)
    await lane.scrollIntoViewIfNeeded()
    const b = (await lane.boundingBox())!
    const cdp = await page.context().newCDPSession(page)
    const start = async () => (await log(page, id)).find(e => e.type === "infusion_start")!.ts
    const s0 = await start()
    await finger(cdp, page, b.x + 20, b.y + b.height / 2, -90, 60)
    expect(await start()).toBe(s0)
    await finger(cdp, page, b.x + 20, b.y + b.height / 2, -90, 700)
    expect(await start()).toBe(s0)
  } finally { await page.request.delete(`/api/cases/${id}`, { headers: { Origin: ORIGIN } }) }
})
