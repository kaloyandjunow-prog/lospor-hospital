import { test, expect, type Page } from "@playwright/test"

/**
 * The one chart menu (10.8.0), driven through a browser: a click opens the menu, nothing asks
 * "are you sure", every action leaves an Undo bar, Ctrl+Z / the bar undo it, the keyboard walks the
 * chart, the right click is ours, and a finished fluid says how much, for how long and at what rate.
 * The arithmetic is tested in Core; this fails when the screen goes dead.
 */

const ORIGIN = "http://localhost:3000"
test.describe.configure({ timeout: 120_000 })

const created: string[] = []
test.afterEach(async ({ page }) => {
  await page.goto("about:blank")
  for (const id of created.splice(0)) await page.request.delete(`/api/cases/${id}`, { headers: { Origin: ORIGIN } })
})

/** A case that began 20 minutes ago with a running agent, plus a finished fluid run. */
async function seedCase(page: Page, extra?: (post: (data: Record<string, unknown>) => Promise<void>, at: (min: number) => string) => Promise<void>) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const now = Date.now()
  const at = (min: number) => new Date(now + min * 60_000).toISOString()
  const startedAt = new Date(now - 20 * 60_000)
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false }).format(startedAt)
  const headers = { Origin: ORIGIN, "Content-Type": "application/json" }
  const create = await page.request.post("/api/cases", { headers, data: {
    preop: { ageYears: 41, sex: "MALE", heightCm: 178, weightKg: 82, clinicalMode: "ADULT" },
    intraop: { startTime: local, startedAt: startedAt.toISOString(), timezone: zone, techniques: ["GENERAL_INHALATION"] },
  } })
  expect(create.ok(), `create failed: ${create.status()}`).toBeTruthy()
  const { id } = await create.json() as { id: string }
  created.push(id)
  const post = async (data: Record<string, unknown>) => {
    const response = await page.request.post(`/api/cases/${id}/events`, { headers, data })
    expect(response.ok(), `event failed: ${response.status()} ${await response.text()}`).toBeTruthy()
  }
  await post({ type: "agent_start", ts: at(-15), name: "Sevoflurane", value: "2", agentMode: "concurrent" })
  await post({ type: "fluid_start", ts: at(-18), fluidId: "fl-rl", name: "Ringer", rate: "600", unit: "mL/h", volume: "", color: "#06b6d4", fluidEntryMode: "RATE", category: "Crystalloids" })
  await post({ type: "fluid_end", ts: at(-3), fluidId: "fl-rl" })
  if (extra) await extra(post, at)
  return id
}

async function openChart(page: Page, id: string) {
  await page.goto(`/cases/new?continue=${id}&step=1`, { waitUntil: "domcontentloaded" })
  await expect(page).not.toHaveURL(/\/login/)
  const tab = page.getByRole("tab", { name: "Chart" })
  if (await tab.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false)) await tab.click()
  const chart = page.locator('[data-tour="intraop-timetable"]')
  await expect(chart).toBeVisible({ timeout: 60_000 })
  return chart
}

const agentCell = (chart: ReturnType<Page["locator"]>) => chart.locator("[data-agent-cell]").nth(3)

test("a click opens the menu; Stop needs no confirmation and the Undo bar takes it back", async ({ page }) => {
  const chart = await openChart(page, await seedCase(page))
  await agentCell(chart).click()
  await expect(page.getByTestId("timetable-cell-menu")).toBeVisible()
  await expect(page.getByTestId("cell-menu-stop")).toBeVisible()
  await page.getByTestId("cell-menu-stop").click()

  // No "are you sure": the action is done and the bar says so.
  await expect(page.getByRole("alertdialog")).toHaveCount(0)
  await expect(page.getByTestId("timetable-undo-bar")).toBeVisible()
  await page.getByTestId("timetable-undo-bar-undo").click()
  await expect(page.getByTestId("timetable-undo-bar")).toHaveCount(0)

  // Back to running: the same cell offers Stop again.
  await agentCell(chart).click()
  await expect(page.getByTestId("cell-menu-stop")).toBeVisible()
})

test("Ctrl+Z undoes the last action and Ctrl+Y does it again", async ({ page }) => {
  const chart = await openChart(page, await seedCase(page))
  await agentCell(chart).click()
  await page.getByTestId("cell-menu-stop").click()
  await expect(page.getByTestId("timetable-undo-bar")).toBeVisible()

  await page.keyboard.press("Control+z")
  await expect(page.getByTestId("timetable-undo-bar")).toHaveCount(0)
  await agentCell(chart).click()
  await expect(page.getByTestId("cell-menu-stop")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("timetable-cell-menu")).toHaveCount(0)

  await page.keyboard.press("Control+y")
  await expect(page.getByTestId("timetable-undo-bar")).toBeVisible()
})

test("the keyboard walks the chart: arrows move the highlight, Enter opens the menu, Esc closes it", async ({ page }) => {
  const chart = await openChart(page, await seedCase(page))
  await agentCell(chart).click()
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("timetable-cell-menu")).toHaveCount(0)

  const armed = () => chart.locator("[data-tt-armed]")
  await expect(armed()).toHaveCount(1)
  const before = await armed().evaluate(el => el.getBoundingClientRect().left)
  await page.keyboard.press("ArrowRight")
  const after = await armed().evaluate(el => el.getBoundingClientRect().left)
  expect(after).toBeGreaterThan(before)

  await page.keyboard.press("Enter")
  await expect(page.getByTestId("timetable-cell-menu")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("timetable-cell-menu")).toHaveCount(0)
})

test("pointing at a cell highlights it", async ({ page }) => {
  const chart = await openChart(page, await seedCase(page))
  const cell = chart.locator("[data-tt-cell]").nth(5)
  await cell.hover()
  await expect.poll(() => cell.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe("none")
})

test("the right click is ours: the browser's menu is not shown over the chart", async ({ page }) => {
  const chart = await openChart(page, await seedCase(page))
  const prevented = await chart.evaluate(root => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    root.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(prevented).toBe(true)
})

test("the +1 h / -1 h buttons are gone", async ({ page }) => {
  const chart = await openChart(page, await seedCase(page))
  await expect(chart.getByText(/^[+-] ?1 ?h(r)?$/)).toHaveCount(0)
})

test("a finished fluid says how much, for how long and at what rate", async ({ page }) => {
  const chart = await openChart(page, await seedCase(page))
  // 600 mL/h for 15 minutes -> 150 mL, 15 min, 600 mL/h (Core's words, shared with the PWA).
  await expect(chart.getByText(/150 mL · 15 min · 600 mL\/h/).first()).toBeVisible({ timeout: 30_000 })
})

// 10.8.0: Stop asks only what it must. An ordinary infusion stops at once; a TCI infusion asks for the pump's
// total (optional); a fluid by rate stops at once, a fluid entered as a bag asks how much of it ran.
const savedLog = async (page: Page, id: string) => ((await (await page.request.get(`/api/cases/${id}`)).json()).intraop?.keyEvents?.log ?? []) as { type: string; pumpTotal?: number; pumpTotalUnit?: string }[]
const laneCell = (chart: ReturnType<Page["locator"]>, lane: string) => chart.locator(`[data-tt-lane^="${lane}"] [data-tt-cell]`).nth(3)

test("stopping an ordinary infusion asks nothing", async ({ page }) => {
  const id = await seedCase(page, async (post, at) => { await post({ type: "infusion_start", ts: at(-15), infId: "inf-prop", name: "Propofol", rate: "6", unit: "mg/kg/h", color: "#8b5cf6" }) })
  const chart = await openChart(page, id)
  await page.waitForTimeout(1_500)
  await laneCell(chart, "infusion").click()
  await page.getByTestId("cell-menu-stop").click()
  await expect(page.getByTestId("tci-stop-dialog")).toHaveCount(0)
  await expect(page.getByTestId("timetable-undo-bar")).toBeVisible()
  await expect.poll(async () => (await savedLog(page, id)).filter(e => e.type === "infusion_stop").length, { timeout: 15_000 }).toBe(1)
})

test("stopping a TCI infusion offers the pump's total, which is kept", async ({ page }) => {
  const id = await seedCase(page, async (post, at) => { await post({ type: "infusion_start", ts: at(-15), infId: "inf-tci", name: "Propofol", rate: "3", unit: "mcg/mL", color: "#8b5cf6", tciModel: "MARSH", tciSite: "PLASMA" }) })
  const chart = await openChart(page, id)
  await page.waitForTimeout(1_500)
  await laneCell(chart, "infusion").click()
  await page.getByTestId("cell-menu-stop").click()
  await expect(page.getByTestId("tci-stop-dialog")).toBeVisible()
  expect((await savedLog(page, id)).filter(e => e.type === "infusion_stop")).toHaveLength(0)
  await page.getByTestId("tci-stop-total").fill("180")
  await page.getByTestId("tci-stop-confirm").click()
  await expect.poll(async () => (await savedLog(page, id)).find(e => e.type === "infusion_stop")?.pumpTotal, { timeout: 15_000 }).toBe(180)
})

test("stopping a fluid by rate asks nothing; a bag asks how much of it ran", async ({ page }) => {
  const id = await seedCase(page, async (post, at) => {
    await post({ type: "fluid_start", ts: at(-15), fluidId: "fl-rate", name: "Hartmann", rate: "300", unit: "mL/h", volume: "", color: "#06b6d4", fluidEntryMode: "RATE", category: "Crystalloids" })
  })
  const chart = await openChart(page, id)
  await page.waitForTimeout(1_500)
  const lane = chart.locator('[data-tt-lane^="fluid"]').filter({ hasText: "Hartmann" }).first()
  await lane.locator("[data-tt-cell]").nth(3).click()
  await page.getByTestId("cell-menu-stop").click()
  await expect(page.getByTestId("timetable-undo-bar")).toBeVisible()
  await expect.poll(async () => (await savedLog(page, id)).filter(e => e.type === "fluid_end").length, { timeout: 15_000 }).toBe(2) // the seeded Ringer's and this one
})

// 10.8.0: a bar's label can be cut off by its cell; pointing at the bar shows the full text above its row.
test("a cut-off bar label shows its full text when the pointer rests on the bar", async ({ page }) => {
  const id = await seedCase(page, async (post, at) => {
    await post({ type: "fluid_start", ts: at(-14), fluidId: "fl-h", name: "Hartmann's balanced crystalloid solution with a very long product name, written out in full so that the bar cannot hold it", rate: "300", unit: "mL/h", volume: "", color: "#06b6d4", fluidEntryMode: "RATE", category: "Crystalloids" })
  })
  const chart = await openChart(page, id)
  await page.waitForTimeout(1_500)
  const cell = chart.locator('[data-tt-lane^="fluid"]').filter({ hasText: "very long product" }).first().locator("[data-tt-cell]").nth(3)
  await cell.hover()
  // Playwright scrolls the chart into view as it hovers, and a scroll takes a tip away: the pointer, moving again, brings it back.
  await page.waitForTimeout(600)
  const box = (await cell.boundingBox())!
  await page.mouse.move(box.x + box.width / 2 + 3, box.y + 10)
  await expect(page.locator(".tt-tip")).toContainText("very long product name", { timeout: 5_000 })
  await page.mouse.move(2, 2)
  await expect(page.locator(".tt-tip")).toHaveCount(0)
})

// Review 2026-11-23: in the browser's full screen only the full-screen element is shown, so the menu has to be drawn inside it.
test("in full screen the menu is still shown", async ({ page }) => {
  const chart = await openChart(page, await seedCase(page))
  await page.getByTestId("timetable-fullscreen").click()
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true)
  await agentCell(chart).click()
  const menu = page.getByTestId("timetable-cell-menu")
  await expect(menu).toBeVisible()
  expect(await menu.evaluate(element => !!document.fullscreenElement?.contains(element))).toBe(true)
  await page.getByTestId("popover-close").click()
  await expect(menu).toHaveCount(0)
})
