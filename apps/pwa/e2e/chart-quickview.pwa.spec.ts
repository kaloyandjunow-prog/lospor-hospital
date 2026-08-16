import { expect, test } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { ACCOUNTS, API_BASE, signInAs, tokenFor } from "./session"

// Screenshots of the read-only chart quickview reached from the live cockpit.
//
// Not an assertion suite: this exists to show what the feature looks like with
// real data behind it. It creates its own case through the API so the chart has
// vitals and an agent to draw, rather than depending on whatever happens to be
// in the dev database.

const SHOTS = join(__dirname, "..", ".shots")

test("chart quickview, from the live cockpit", async ({ page, request }) => {
  mkdirSync(SHOTS, { recursive: true })
  const token = await tokenFor(request, ACCOUNTS.admin)
  const authed = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }

  // A case that has been running for an hour, so the timetable has a span to
  // draw rather than a single column at the left edge.
  const startedAt = new Date(Date.now() - 60 * 60_000)
  const created = await request.post(`${API_BASE}/v1/cases`, {
    headers: authed,
    data: {
      preop: {
        procedureName: "Laparoscopic cholecystectomy",
        diagnosis: "Cholelithiasis",
        asaClass: 2,
        age: 54,
        weight: 78,
        height: 172,
        sex: "FEMALE",
        urgency: "ELECTIVE",
      },
    },
  })
  expect(created.ok(), `case creation failed: ${created.status()} ${(await created.text()).slice(0, 300)}`).toBe(true)
  const caseId: string = (await created.json()).id

  // Vitals every five minutes, drifting a little so the traces are not flat
  // lines — a flat chart would hide whether the graph band renders at all.
  for (let step = 0; step < 12; step += 1) {
    const at = new Date(startedAt.getTime() + step * 5 * 60_000).toISOString()
    const written = await request.post(`${API_BASE}/v1/cases/${caseId}/events`, {
      headers: authed,
      // Vital fields sit flat on the event and the timestamp field is `ts`;
      // there is no nested payload.
      data: {
        type: "vital",
        ts: at,
        systolic: 118 + ((step * 7) % 22),
        diastolic: 68 + ((step * 5) % 14),
        heartRate: 62 + ((step * 3) % 18),
        spO2: 97 + (step % 3),
      },
    })
    // Checked, because an unchecked write is how this spec first failed: every
    // POST was silently rejected, the chart drew an empty case, and the only
    // symptom was a missing row label thirty lines further down.
    expect(
      written.ok(),
      `vital ${step} rejected: ${written.status()} ${(await written.text()).slice(0, 300)}`,
    ).toBe(true)
  }

  await signInAs(page, request, ACCOUNTS.admin)
  await page.goto(`/cases/intraop/${caseId}`)

  // The cockpit opens on Equipment; the footer lives on the Timetable tab.
  await expect(page.getByText("Equipment", { exact: true })).toBeVisible({ timeout: 30_000 })
  await page.getByText("Timetable", { exact: true }).click()
  await expect(page.getByText("End case", { exact: true })).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: join(SHOTS, "1-cockpit-footer.png"), fullPage: false })

  const chart = page.getByText("Chart", { exact: false }).first()
  await expect(chart).toBeVisible()
  await chart.click()

  await expect(page.getByText("Intraop timetable", { exact: false }).first()).toBeVisible({ timeout: 30_000 })
  // The viewer renders this instead of a chart when it finds nothing to draw,
  // and that state looks like a perfectly working screen. This is the assertion
  // that the chart has data behind it.
  //
  // Not the row labels: those are drawn inside the SVG panel by
  // react-native-svg, which getByText cannot reach on web. Asserting them
  // failed here for two runs while the feature itself was fine.
  await expect(page.getByText("No intraoperative data recorded")).toHaveCount(0)
  await expect(page.locator("svg").first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(SHOTS, "2-chart-quickview.png"), fullPage: false })
  await page.screenshot({ path: join(SHOTS, "3-chart-quickview-full.png"), fullPage: true })

  // The close control, which is the reason this screen has a header at all: the
  // first version relied on the system back gesture, invisible to anyone
  // holding the phone one-handed and looking for a way out.
  await page.getByLabel("Back", { exact: false }).first().click()
  await expect(page.getByText("End case", { exact: true })).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: join(SHOTS, "4-back-in-cockpit.png"), fullPage: false })
})
