import { test, expect } from "@playwright/test"
import { contextFor, JSON_HEADERS } from "./roles"

// An unassessed Aldrete component must not be recorded as zero.
//
// Zero is not "not yet scored" — it is the worst score on the scale: unable to
// move, apnoeic, unresponsive. The postoperative form used to default all five
// components to 0, so simply opening the recovery screen and saving anything
// else wrote a fully-documented score of 0/10 for a patient nobody had looked
// at. That is a clinical claim, and it was false.
//
// So this drives the real form rather than the API: what is being tested is
// what the *client* sends, and only the browser can demonstrate that.

const PREOP = { ageYears: 61, sex: "FEMALE" as const, heightCm: 162, weightKg: 68 }

// The autosave in PostopForm is debounced by 1500 ms; give it room and poll.
async function readPostop(request: import("@playwright/test").APIRequestContext, id: string) {
  return (await request.get(`/api/cases/${id}`).then(r => r.json())).postop
}

test("opening the recovery form records no Aldrete score", async ({ browser }) => {
  const context = await contextFor(browser, "member-a")
  const page = await context.newPage()
  const api = context.request

  const created = await api.post("/api/cases", { headers: JSON_HEADERS, data: { preop: PREOP } })
  expect(created.status(), await created.text()).toBe(201)
  const { id } = await created.json()

  try {
    await page.goto(`/cases/new?continue=${id}&step=2`)
    await expect(page).not.toHaveURL(/\/login/)

    const aldrete = page.locator('[data-tour="postop-aldrete"]')
    await expect(aldrete).toBeVisible({ timeout: 20_000 })

    // No components scored, so there is no total — not a zero, and no verdict.
    await expect(page.getByTestId("aldrete-total")).toHaveText("— / 10")

    // Let the form's own autosave run at least once on an untouched screen.
    await page.waitForTimeout(3_000)

    const untouched = await readPostop(api, id)
    if (untouched) {
      expect(untouched.aldreteActivity).toBeNull()
      expect(untouched.aldreteRespiration).toBeNull()
      expect(untouched.aldreteCirculation).toBeNull()
      expect(untouched.aldreteConsciousness).toBeNull()
      expect(untouched.aldreteSpO2).toBeNull()
      expect(untouched.aldreteTotal).toBeNull()
    }
    // PONV is deliberately not asserted here. It is a checkbox: unticked on the
    // screen and false in the record say the same thing, so the clinician can
    // see what was stored. Aldrete was different — the buttons showed nothing
    // selected while the record claimed a scored 0/10.

    // ── score one component; the other four stay unassessed ──────────────
    // Rows are Activity, Respiration, Circulation, Consciousness, SpO2; the
    // three buttons in each are the scores 0, 1, 2.
    const activity = aldrete.locator("div.grid.grid-cols-3").first()
    await activity.getByRole("button").nth(2).click()

    // One of five is not a score, so the total still has nothing to show.
    await expect(page.getByTestId("aldrete-total")).toHaveText("— / 10")

    await expect.poll(
      async () => (await readPostop(api, id))?.aldreteActivity ?? null,
      { timeout: 20_000, message: "autosave never persisted the scored component" },
    ).toBe(2)

    const partial = await readPostop(api, id)
    expect(partial.aldreteRespiration).toBeNull()
    expect(partial.aldreteCirculation).toBeNull()
    expect(partial.aldreteConsciousness).toBeNull()
    expect(partial.aldreteSpO2).toBeNull()
    // A running total over an incomplete score would read as an assessment.
    expect(partial.aldreteTotal).toBeNull()
  } finally {
    await api.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    await context.close()
  }
})
