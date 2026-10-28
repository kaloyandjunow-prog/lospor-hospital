import { test, expect, type Page, type Locator } from "@playwright/test"

/**
 * Dragging the end of a bar, and what that writes to the saved event log.
 *
 * The end grip used to write a stop on every drop: dragged back it stopped the
 * bar, and dragged forward on a running bar it wrote a stop in the future.
 * Now a stop before now is asked about first, a drop at or past now on a
 * running bar writes nothing, and clicking anywhere on an agent bar opens its
 * editor. Read from the API, not the screen, because the bug was in the log.
 */

const ORIGIN = "http://localhost:3000"
test.describe.configure({ timeout: 180_000 })

type LogEntry = { type: string; name?: string; ts: string }
const created: string[] = []

test.afterEach(async ({ page }) => {
  await page.goto("about:blank")
  for (const id of created.splice(0)) await page.request.delete(`/api/cases/${id}`, { headers: { Origin: ORIGIN } })
})

async function createRecentCase(page: Page) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const startedAt = new Date(Date.now() - 20 * 60_000)
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false }).format(startedAt)
  const create = await page.request.post("/api/cases", {
    headers: { Origin: ORIGIN },
    data: {
      preop: { ageYears: 41, sex: "MALE", heightCm: 178, weightKg: 82, clinicalMode: "ADULT" },
      intraop: { startTime: local, startedAt: startedAt.toISOString(), timezone: zone, techniques: ["GENERAL_INHALATION"] },
    },
  })
  expect(create.ok(), `create failed: ${create.status()}`).toBeTruthy()
  const id = (await create.json()).id as string
  created.push(id)
  return id
}

async function openChart(page: Page, id: string) {
  await page.goto(`/cases/new?continue=${id}&step=1`, { waitUntil: "domcontentloaded" })
  const tab = page.getByRole("tab", { name: "Chart" })
  if (await tab.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false)) await tab.click()
  const chart = page.locator('[data-tour="intraop-timetable"]')
  await expect(chart).toBeVisible({ timeout: 60_000 })
  return chart
}

async function events(page: Page, id: string, prefix: string) {
  const body = await page.request.get(`/api/cases/${id}`).then(r => r.json())
  return ((body?.intraop?.keyEvents?.log ?? []) as LogEntry[]).filter(e => e.type.startsWith(prefix))
}

async function startSevo(page: Page, id: string, chart: Locator) {
  await chart.locator("[data-agent-cell]").nth(0).click()
  await page.getByRole("button", { name: "Sevoflurane", exact: true }).click()
  await page.getByRole("button", { name: /^Start Sevoflurane/ }).click()
  await expect.poll(async () => (await events(page, id, "agent")).length, { timeout: 15_000 }).toBe(1)
}

async function dragGrip(page: Page, chart: Locator, gripSel: string, toIndex: number) {
  // Playwright occasionally presses a pixel the browser does not treat as the
  // start of an HTML5 drag; confirm it started and grab again if it did not.
  await page.evaluate(() => {
    const w = window as unknown as { __dragStarted?: boolean; __dragListener?: boolean }
    w.__dragStarted = false
    if (!w.__dragListener) { w.__dragListener = true; document.addEventListener("dragstart", () => { w.__dragStarted = true }, true) }
  })
  const started = () => page.evaluate(() => (window as unknown as { __dragStarted?: boolean }).__dragStarted === true)
  let g!: { x: number; y: number; width: number; height: number }
  for (let attempt = 0; attempt < 4; attempt++) {
    g = (await chart.locator(gripSel).first().boundingBox())!
    const target = (await chart.locator("[data-agent-cell]").nth(toIndex).boundingBox())!
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await page.mouse.down()
    await page.mouse.move(g.x + g.width / 2 + (target.x < g.x ? -8 : 8), g.y + g.height / 2, { steps: 4 })
    await page.waitForTimeout(150)
    if (await started()) break
    await page.mouse.up()
    await page.waitForTimeout(400)
  }
  expect(await started(), "the grip never started a drag").toBe(true)
  const target = (await chart.locator("[data-agent-cell]").nth(toIndex).boundingBox())!
  for (let i = 1; i <= 6; i++) {
    const x = g.x + g.width / 2 + ((target.x + target.width / 2) - (g.x + g.width / 2)) * i / 6
    await page.mouse.move(x, g.y + g.height / 2, { steps: 4 })
    await page.waitForTimeout(120)
  }
  // A hand keeps moving a little before it lets go; releasing in the same
  // instant as the last hover can land on an element React has just replaced.
  await page.mouse.move(target.x + target.width / 2 + 2, g.y + g.height / 2, { steps: 2 })
  await page.waitForTimeout(600)
  await page.mouse.up()
}

const AGENT_GRIP = "[data-agent-cell] div[draggable]"

test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1600, height: 1000 }) })

test("dragging a running agent back asks first, and writes one stop only when confirmed", async ({ page }) => {
  const id = await createRecentCase(page)
  const chart = await openChart(page, id)
  await startSevo(page, id, chart)

  await dragGrip(page, chart, AGENT_GRIP, 1)
  await expect(page.getByText(/^Stop Sevoflurane at/)).toBeVisible()
  expect((await events(page, id, "agent")).map(e => e.type)).toEqual(["agent_start"])

  await page.getByRole("button", { name: "Cancel" }).click()
  await page.waitForTimeout(1500)
  expect((await events(page, id, "agent")).map(e => e.type)).toEqual(["agent_start"])

  await dragGrip(page, chart, AGENT_GRIP, 1)
  await page.getByRole("button", { name: "Stop", exact: true }).click()
  await expect.poll(async () => (await events(page, id, "agent")).map(e => e.type), { timeout: 15_000 }).toEqual(["agent_start", "agent_stop"])
})

test("dragging a running agent forward past now writes nothing", async ({ page }) => {
  const id = await createRecentCase(page)
  const chart = await openChart(page, id)
  await startSevo(page, id, chart)

  await dragGrip(page, chart, AGENT_GRIP, 8)
  await page.waitForTimeout(3000)
  expect((await events(page, id, "agent")).map(e => e.type)).toEqual(["agent_start"])
  await expect(page.getByText(/^Stop Sevoflurane at/)).toHaveCount(0)
})

test("a stopped agent keeps its grip: dragging it moves the one stop, and past now takes it away", async ({ page }) => {
  const id = await createRecentCase(page)
  const chart = await openChart(page, id)
  await startSevo(page, id, chart)
  await dragGrip(page, chart, AGENT_GRIP, 2)
  await page.getByRole("button", { name: "Stop", exact: true }).click()
  await expect.poll(async () => (await events(page, id, "agent")).length, { timeout: 15_000 }).toBe(2)
  const firstStop = (await events(page, id, "agent")).find(e => e.type === "agent_stop")!.ts

  await dragGrip(page, chart, AGENT_GRIP, 1)
  await expect.poll(async () => (await events(page, id, "agent")).find(e => e.type === "agent_stop")?.ts, { timeout: 15_000 }).not.toBe(firstStop)
  expect((await events(page, id, "agent")).map(e => e.type)).toEqual(["agent_start", "agent_stop"])

  await dragGrip(page, chart, AGENT_GRIP, 8)
  await expect.poll(async () => (await events(page, id, "agent")).map(e => e.type), { timeout: 15_000 }).toEqual(["agent_start"])
})

test("clicking an agent bar opens its editor: a change from that time in the middle, a logged correction on its start", async ({ page }) => {
  const id = await createRecentCase(page)
  const chart = await openChart(page, id)
  await startSevo(page, id, chart)
  const mid = (await chart.locator("[data-agent-cell]").nth(2).boundingBox())!
  await page.mouse.click(mid.x + mid.width / 2, mid.y + mid.height / 2)
  await expect(page.getByText(/^Change Sevoflurane from /)).toBeVisible()
  await expect(page.getByText("Recorded as a new concentration from that time", { exact: false })).toBeVisible()
  await page.keyboard.press("Escape")
  await page.mouse.click(5, 5)
  const first = (await chart.locator("[data-agent-cell]").nth(0).boundingBox())!
  await page.mouse.click(first.x + first.width / 2, first.y + first.height / 2)
  await expect(page.getByText("kept in the audit log", { exact: false })).toBeVisible()
})

test("dragging a running infusion back asks first and writes no stop until confirmed", async ({ page }) => {
  const id = await createRecentCase(page)
  const chart = await openChart(page, id)
  await chart.getByTestId("add-infusion").nth(0).click({ timeout: 30_000 })
  await page.getByRole("button", { name: "Browse all infusions" }).click({ timeout: 30_000 })
  await page.getByPlaceholder("Search infusion").fill("Propofol")
  await page.getByRole("button", { name: /^Propofol/ }).first().click()
  await page.getByRole("button", { name: "Start Infusion" }).click()
  await expect.poll(async () => (await events(page, id, "infusion")).length, { timeout: 15_000 }).toBe(1)

  // Clicking a bar toggles its selection, so select it only if it is not already.
  const endGrip = chart.locator("div[draggable].cursor-col-resize.rounded-r-sm").first()
  await page.waitForTimeout(500)
  if (!(await endGrip.isVisible())) await chart.locator("div[draggable].cursor-grab").first().click()
  await expect(endGrip).toBeVisible()
  await dragGrip(page, chart, "div[draggable].cursor-col-resize.rounded-r-sm", 1)
  await expect(page.getByText(/^Stop Propofol/)).toBeVisible()
  expect((await events(page, id, "infusion")).map(e => e.type)).toEqual(["infusion_start"])
})
