import { test, expect, type Page, type Locator } from "@playwright/test"
import { dragGrip } from "./drag-grip"

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
  // An agent starts at 0 and Start needs a concentration: pick the 2.5 quick button.
  await page.getByRole("button", { name: "2.5", exact: true }).click()
  await page.getByRole("button", { name: /^Start Sevoflurane/ }).click()
  await expect.poll(async () => (await events(page, id, "agent")).length, { timeout: 15_000 }).toBe(1)
}

const AGENT_GRIP = "[data-agent-cell] div[draggable]"

test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1600, height: 1000 }) })

// 10.8.0 (rule 6): a grip dropped before "now" stops there at once, with no question; the Undo bar takes it back.
test("dragging a running agent back stops it without a question, and Undo takes it back", async ({ page }) => {
  const id = await createRecentCase(page)
  const chart = await openChart(page, id)
  await startSevo(page, id, chart)

  await dragGrip(page, chart, AGENT_GRIP, 1)
  await expect(page.getByRole("alertdialog")).toHaveCount(0)
  await expect.poll(async () => (await events(page, id, "agent")).map(e => e.type), { timeout: 15_000 }).toEqual(["agent_start", "agent_stop"])

  await page.getByTestId("timetable-undo-bar-undo").click()
  await expect.poll(async () => (await events(page, id, "agent")).map(e => e.type), { timeout: 15_000 }).toEqual(["agent_start"])
})
// 10.8.0 (rule 6): a grip dropped after "now" plans the stop there (it does not run until its time comes).
test("dragging a running agent forward past now plans the stop", async ({ page }) => {
  const id = await createRecentCase(page)
  const chart = await openChart(page, id)
  await startSevo(page, id, chart)

  const droppedAt = Date.now()
  await dragGrip(page, chart, AGENT_GRIP, 8)
  await expect.poll(async () => {
    const log = await events(page, id, "agent")
    const stop = log.find(e => e.type === "agent_stop")
    return log.length === 2 && !!stop && Date.parse(stop.ts) > droppedAt
  }, { timeout: 15_000 }).toBe(true)
})
test("a stopped agent keeps its grip: dragging it moves the one stop", async ({ page }) => {
  const id = await createRecentCase(page)
  const chart = await openChart(page, id)
  await startSevo(page, id, chart)

  await dragGrip(page, chart, AGENT_GRIP, 2)
  await expect.poll(async () => (await events(page, id, "agent")).length, { timeout: 15_000 }).toBe(2)
  const firstStop = (await events(page, id, "agent")).find(e => e.type === "agent_stop")!.ts

  await dragGrip(page, chart, AGENT_GRIP, 1)
  await expect.poll(async () => (await events(page, id, "agent")).find(e => e.type === "agent_stop")?.ts, { timeout: 15_000 }).not.toBe(firstStop)
  expect((await events(page, id, "agent")).map(e => e.type)).toEqual(["agent_start", "agent_stop"])
})
// A bar is not an editor any more (10.8.0): a click opens the chart's one menu for that cell.
test("clicking an agent bar opens the menu: a change of dose in the middle, a fixed start on its first cell", async ({ page }) => {
  const id = await createRecentCase(page)
  const chart = await openChart(page, id)
  await startSevo(page, id, chart)
  await page.waitForTimeout(1_500)
  await chart.locator("[data-agent-cell]").nth(2).click()
  await expect(page.getByTestId("cell-menu-change_dose")).toBeVisible()
  await expect(page.getByTestId("cell-menu-stop")).toBeVisible()
  await page.keyboard.press("Escape")
  await chart.locator("[data-agent-cell]").nth(0).click()
  await expect(page.getByTestId("cell-menu-fix_start")).toBeVisible()
})
// 10.8.0: an ordinary infusion stops where the grip is dropped, with no question (only a TCI infusion asks for the pump's total).
test("dragging a running infusion back stops it without a question", async ({ page }) => {
  const id = await createRecentCase(page)
  const chart = await openChart(page, id)
  await chart.getByTestId("add-infusion").nth(0).click({ timeout: 30_000 })
  await page.getByRole("button", { name: "Browse all infusions" }).click({ timeout: 30_000 })
  await page.getByPlaceholder("Search infusion").fill("Propofol")
  await page.getByRole("button", { name: /^Propofol/ }).first().click()
  await page.getByRole("button", { name: "Start Infusion" }).click()
  await expect.poll(async () => (await events(page, id, "infusion")).length, { timeout: 15_000 }).toBe(1)
  const running = page.getByTestId("still-running-yes")
  if (await running.waitFor({ state: "visible", timeout: 4_000 }).then(() => true, () => false)) await running.click()

  const endGrip = chart.locator("div[draggable].cursor-col-resize.rounded-r-sm").first()
  await page.waitForTimeout(500)
  if (!(await endGrip.isVisible())) await chart.getByTestId("infusion-lane").locator("[data-tt-cell]").nth(1).click()
  await page.keyboard.press("Escape")
  await expect(endGrip).toBeVisible()
  await dragGrip(page, chart, "div[draggable].cursor-col-resize.rounded-r-sm", 1)
  await expect(page.getByRole("button", { name: "Discontinue" })).toHaveCount(0)
  await expect.poll(async () => (await events(page, id, "infusion")).map(e => e.type), { timeout: 15_000 }).toEqual(["infusion_start", "infusion_stop"])
})

