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
  await page.waitForTimeout(1500)
  return chart
}
async function finger(cdp: CDPSession, page: Page, x: number, y: number, dx: number, holdMs: number) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
  await page.waitForTimeout(holdMs)
  for (let i = 1; i <= 12; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx * i / 12, y }] }); await page.waitForTimeout(40) }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await page.waitForTimeout(2500)
}

test("hold and slide an end grip moves the end", async ({ page }) => {
  const id = await seed(page, true)
  try {
    const chart = await open(page, id)
    await chart.locator('[data-testid="infusion-lane"] div[draggable]').first().tap()
    await page.waitForTimeout(400)
    const grip = chart.locator('[data-testid="infusion-lane"] div[draggable="true"].cursor-col-resize').last()
    const b = (await grip.boundingBox({ timeout: 10_000 }))!
    const before = (await log(page, id)).find(e => e.type === "infusion_stop")!.ts
    await finger(await page.context().newCDPSession(page), page, b.x + b.width / 2, b.y + b.height / 2, 160, 700)
    const after = (await log(page, id)).find(e => e.type === "infusion_stop")!.ts
    expect(Date.parse(after) - Date.parse(before)).toBeGreaterThan(0)
  } finally { await page.request.delete(`/api/cases/${id}`, { headers: { Origin: ORIGIN } }) }
})

test("hold and slide a running bar moves it; a quick swipe does not", async ({ page }) => {
  const id = await seed(page, false)
  try {
    const chart = await open(page, id)
    const bar = chart.locator('[data-testid="infusion-lane"] div[draggable="true"]').first()
    const b = (await bar.boundingBox())!
    const cdp = await page.context().newCDPSession(page)
    const start = async () => (await log(page, id)).find(e => e.type === "infusion_start")!.ts
    const s0 = await start()
    await finger(cdp, page, b.x + 20, b.y + b.height / 2, -90, 60)
    const s1 = await start()
    expect(s1).toBe(s0)
    await finger(cdp, page, b.x + 20, b.y + b.height / 2, -90, 700)
    const s2 = await start()
    expect(Date.parse(s1) - Date.parse(s2)).toBeGreaterThan(0)
  } finally { await page.request.delete(`/api/cases/${id}`, { headers: { Origin: ORIGIN } }) }
})
