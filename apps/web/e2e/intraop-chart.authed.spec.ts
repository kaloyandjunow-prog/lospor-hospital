import { test, expect, type Page } from "@playwright/test"

/**
 * The intraoperative chart, driven through a browser.
 *
 * Everything else about the chart is tested as pure functions — what a dose
 * resolves to, what the flyout opens with, where a bar starts. None of that
 * proves the chart still mounts, or that tapping a cell still reaches those
 * functions. This is the test that fails when a refactor leaves the arithmetic
 * correct and the screen dead, which is the failure mode unit tests and a
 * typechecker both wave through.
 *
 * It is deliberately shallow: mount, and open the dosing flyout from a real
 * cell. Deeper chart behaviour belongs in the unit tests, where it can be
 * stated precisely and run in milliseconds.
 */

const ORIGIN = "http://localhost:3000"

// The case wizard is the largest client route in the app and the dev server
// compiles it on the first navigation, so this spec is given room rather than
// being made flaky.
test.describe.configure({ timeout: 120_000 })

const created: string[] = []

// Cleanup runs here rather than in a finally: the chart page holds the
// live-case stream open, and a request issued while it is mounted queues
// behind that connection. Leaving the page first releases it.
test.afterEach(async ({ page }) => {
  await page.goto("about:blank")
  for (const id of created.splice(0)) {
    await page.request.delete(`/api/cases/${id}`, { headers: { Origin: ORIGIN } })
  }
})

async function createStartedCase(page: Page, intraop: Record<string, unknown> = {}) {
  const create = await page.request.post("/api/cases", {
    headers: { Origin: ORIGIN },
    data: {
      preop: { ageYears: 41, sex: "MALE", heightCm: 178, weightKg: 82, clinicalMode: "ADULT" },
      intraop: { startTime: "08:00", ...intraop },
    },
  })
  expect(create.ok(), `create failed: ${create.status()}`).toBeTruthy()
  const { id } = await create.json()
  expect(id).toBeTruthy()
  created.push(id as string)
  return id as string
}

async function openChart(page: Page, id: string) {
  // step=1 is the intraoperative step of the case wizard.
  // The wizard holds the live-case stream open, so `load` never fires.
  await page.goto(`/cases/new?continue=${id}&step=1`, { waitUntil: "domcontentloaded" })
  await expect(page).not.toHaveURL(/\/login/)

  // The wizard has two layouts: a tabbed one, and a wider one that puts the
  // chart on the page directly. Click the tab only when there is a tab.
  const tab = page.getByRole("tab", { name: "Chart" })
  const tabbed = await tab.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false)
  if (tabbed) await tab.click()

  const chart = page.locator('[data-tour="intraop-timetable"]')
  await expect(chart).toBeVisible({ timeout: 60_000 })
  return chart
}

/**
 * Start an infusion from the chart's own entry point: browse, search, pick,
 * confirm. "Browse all" is used rather than the favourites or scenario
 * shortcuts, because those depend on what the option library ships.
 */
async function startInfusion(page: Page, chart: ReturnType<Page["locator"]>) {
  await chart.getByTestId("add-infusion").nth(2).click({ timeout: 30_000 })
  await page.getByRole("button", { name: "Browse all infusions" }).click({ timeout: 30_000 })
  await page.getByPlaceholder("Search infusion").fill("Propofol")
  await page.getByRole("button", { name: /^Propofol/ }).first().click()

  const start = page.getByRole("button", { name: "Start Infusion" })
  await expect(start).toBeVisible({ timeout: 30_000 })
  await start.click()

  await expect(chart.getByText("infusion", { exact: true }).first()).toBeVisible({ timeout: 30_000 })
}

test("the chart mounts with its time columns and vitals rows", async ({ page }) => {
  const id = await createStartedCase(page)
  const chart = await openChart(page, id)

  // The grid is built from the case's start time, so the columns run forward
  // from the rounded start in five-minute steps. A chart that mounts but
  // computes no columns is blank in a way that still passes a typecheck.
  await expect(chart.getByText("08:00", { exact: true }).first()).toBeVisible()
  await expect(chart.getByText("08:55", { exact: true }).first()).toBeVisible()

  // The vitals lanes are the chart's reason to exist. The labels are cased in
  // the DOM as "BP Sys" and uppercased by CSS, so match the source text.
  await expect(chart.getByText("BP Sys", { exact: true }).first()).toBeVisible()
  await expect(chart.getByText("BP Dia", { exact: true }).first()).toBeVisible()

  // No inhalational technique on this case, so no agent or gas lane. This is
  // also the negative control for the lane test below, which would otherwise
  // be able to pass without those lanes ever being gated on anything.
  await expect(chart.getByText("Gas Settings", { exact: true })).toHaveCount(0)
})

test("tapping a drug cell opens the picker the dosing flyout is reached through", async ({ page }) => {
  const id = await createStartedCase(page)
  const chart = await openChart(page, id)

  const addDrug = chart.getByTestId("add-drug").first()
  await expect(addDrug).toBeVisible()
  await addDrug.click({ timeout: 30_000 })

  // The picker is populated from the option library, so assert that it offered
  // something rather than naming a drug the library may not ship. An empty
  // picker is the visible symptom of the library having failed to load.
  await expect(page.getByText(/propofol|fentanyl|midazolam|ketamine/i).first())
    .toBeVisible({ timeout: 30_000 })
})

test("a general anaesthetic gets the agent and gas lanes", async ({ page }) => {
  // Both lanes are gated on an inhalational technique, so a case without one
  // has no agent row at all and would pass this test vacuously.
  const id = await createStartedCase(page, { techniques: ["GENERAL_INHALATION"] })
  const chart = await openChart(page, id)

  await expect(chart.getByText("Gas Settings", { exact: true }).first()).toBeVisible()

  // The agent lane offers its empty cells before anything is recorded; that
  // prompt is the lane rendering, not a segment.
  await expect(chart.getByText("choose", { exact: true }).first()).toBeVisible()
})

test("an infusion started from the chart can be dragged to a different time", async ({ page }) => {
  const id = await createStartedCase(page)
  const chart = await openChart(page, id)

  await startInfusion(page, chart)

  const bar = chart.locator('[draggable="true"]').first()
  await expect(bar).toBeVisible()

  // Drag the bar to a later column. This is the interaction the chart is most
  // used for after entry, and the one a refactor of the drag state would break
  // without any other test noticing.
  const before = await bar.boundingBox()
  expect(before, "no bar to drag").not.toBeNull()

  // Drop onto a cell of the lane itself. The drop-zone button below the lane
  // has no drag handlers, so dropping there does nothing at all — which an
  // assertion that only checks the lane survived would not notice.
  const lane = chart.getByTestId("infusion-lane").first()
  const laneBox = await lane.boundingBox()
  expect(laneBox, "no infusion lane").not.toBeNull()
  await bar.dragTo(lane, {
    targetPosition: { x: laneBox!.width - 60, y: laneBox!.height / 2 },
  })

  // The bar has to have actually moved. Asserting only that the lane survived
  // would pass just as well on a drag that did nothing at all.
  await expect(async () => {
    const after = await chart.locator('[draggable="true"]').first().boundingBox()
    expect(after, "the bar left the chart").not.toBeNull()
    expect(after!.x, "the bar did not move").toBeGreaterThan(before!.x)
  }).toPass({ timeout: 10_000 })

  // And it is still an infusion lane, not a bar orphaned out of its row.
  await expect(chart.getByText("infusion", { exact: true }).first()).toBeVisible()
})

test("an infusion's right grip extends the bar", async ({ page }) => {
  const id = await createStartedCase(page)
  const chart = await openChart(page, id)
  await startInfusion(page, chart)

  const lane = chart.getByTestId("infusion-lane").first()
  const bar = chart.locator('[draggable="true"]').first()

  // Grips appear only on the selected bar, so an unselected chart is not
  // covered in handles. Selecting is what makes the grip reachable at all.
  await bar.click()
  const grip = lane.locator('[draggable="true"]').last()
  await expect(grip).toBeVisible()

  const before = await lane.locator('[draggable="true"]').count()
  const laneBox = await lane.boundingBox()
  await grip.dragTo(lane, { targetPosition: { x: laneBox!.width - 60, y: laneBox!.height / 2 } })

  // Extending adds cells to the bar; each column of a bar is its own draggable
  // element, so a longer bar is a larger count. Asserting the bar merely still
  // exists would pass on a grip drag that did nothing.
  await expect(async () => {
    expect(await lane.locator('[draggable="true"]').count(), "the bar did not lengthen")
      .toBeGreaterThan(before)
  }).toPass({ timeout: 10_000 })
})

test("an infusion's left grip extends the bar backwards in time", async ({ page }) => {
  const id = await createStartedCase(page)
  const chart = await openChart(page, id)
  await startInfusion(page, chart)

  const lane = chart.getByTestId("infusion-lane").first()
  await chart.locator('[draggable="true"]').first().click()

  // The left grip is the one that moves a bar's start earlier — for an
  // infusion that was running before anyone got round to charting it.
  const leftGrip = lane.locator('.cursor-col-resize.rounded-l-sm')
  await expect(leftGrip).toBeVisible()

  const before = await lane.locator('[draggable="true"]').count()
  const laneBox = await lane.boundingBox()
  await leftGrip.dragTo(lane, { targetPosition: { x: 120, y: laneBox!.height / 2 } })

  await expect(async () => {
    expect(await lane.locator('[draggable="true"]').count(), "the bar did not lengthen")
      .toBeGreaterThan(before)
  }).toPass({ timeout: 10_000 })
})

test("a rate change can be recorded, and dragging it copies it to another time", async ({ page }) => {
  const id = await createStartedCase(page)
  const chart = await openChart(page, id)
  await startInfusion(page, chart)

  const lane = chart.getByTestId("infusion-lane").first()

  // A fresh infusion occupies one column, so there is nowhere for a rate
  // change to sit. Lengthen it first, then open the menu from a later column
  // of the rate strip so the change lands after the bar started.
  await chart.locator('[draggable="true"]').first().click()
  const laneBox = await lane.boundingBox()
  await lane.locator('.cursor-col-resize.rounded-r-sm')
    .dragTo(lane, { targetPosition: { x: laneBox!.width - 60, y: laneBox!.height / 2 } })

  // y is inside the rate strip, which is the upper band of the bar.
  await lane.click({ position: { x: laneBox!.width - 200, y: 10 } })
  await page.getByRole("button", { name: "Change rate" }).click({ timeout: 30_000 })
  await page.getByRole("button", { name: "Apply" }).click({ timeout: 30_000 })

  // A recorded change puts a draggable divider on the rate strip, marking where
  // one rate gives way to the next.
  const dividers = lane.locator('[draggable="true"].cursor-col-resize.rounded-full')
  await expect(dividers.first()).toBeVisible({ timeout: 30_000 })
  const before = await dividers.count()

  // Dragging a divider copies the change to the column it lands on and leaves
  // the original in place — the handler passes fromCol as null deliberately.
  // The same rate resuming later is a second event, not a correction of the
  // first, so both stay on the record.
  await dividers.first().dragTo(lane, { targetPosition: { x: laneBox!.width - 120, y: 10 } })

  await expect(async () => {
    expect(await dividers.count(), "the rate change was not copied").toBeGreaterThan(before)
  }).toPass({ timeout: 10_000 })
})
