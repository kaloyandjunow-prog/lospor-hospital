import { test, expect, type APIRequestContext } from "@playwright/test"
import { contextFor, JSON_HEADERS } from "./roles"

// The postoperative form in sections (10.0.0): recovery vitals, the recovery
// score with what the observations suggest, pain by the scales the age calls
// for, and discharge. Driven through the real form, because what is tested is
// what the client sends: every pain item with its total, and a suggestion
// that is only ever set by a tap.

async function postopOf(api: APIRequestContext, id: string) {
  return (await api.get(`/api/cases/${id}`).then(r => r.json())).postop
}

test("a three-year-old is offered FLACC and FPS-R, scored item by item", async ({ browser }) => {
  const context = await contextFor(browser, "member-a")
  const page = await context.newPage()
  const api = context.request
  const created = await api.post("/api/cases", {
    headers: JSON_HEADERS,
    data: { clinicalMode: "PEDIATRIC", preop: { ageValue: 3, ageUnit: "YEARS", sex: "MALE", heightCm: 95, weightKg: 14 } },
  })
  expect(created.status(), await created.text()).toBe(201)
  const { id } = await created.json()

  try {
    await page.goto(`/cases/new?continue=${id}&step=2`)
    await expect(page.getByTestId("pain-scales-offered")).toContainText("FLACC, FPS-R", { timeout: 20_000 })
    await expect(page.getByTestId("nips-scale")).toHaveCount(0)
    await expect(page.getByTestId("paed-scale")).toBeVisible()
    // No slider anywhere in the pain or delirium sections.
    await expect(page.locator('#postop-sec-pain input[type="range"]')).toHaveCount(0)

    // FLACC: one answer per behaviour; the total appears once all five are in.
    const flacc = page.getByTestId("flacc-scale")
    const rows = flacc.locator(":scope > div")
    for (const [row, answer] of [[0, 1], [1, 0], [2, 2], [3, 1]] as const) {
      await rows.nth(row).getByRole("button").nth(answer).click()
    }
    await expect(page.getByTestId("flacc-total")).toHaveText("— / 10")
    await rows.nth(4).getByRole("button").nth(1).click()
    await expect(page.getByTestId("flacc-total")).toHaveText("5 / 10")

    // FPS-R: six faces only.
    await expect(page.getByTestId("fpsr-scale").getByRole("button")).toHaveCount(6)
    await page.getByRole("button", { name: "FPS-R 4" }).click()

    await expect.poll(async () => (await postopOf(api, id))?.flaccTotal, { timeout: 15_000 }).toBe(5)
    const saved = await postopOf(api, id)
    expect(saved).toMatchObject({ flaccFace: 1, flaccLegs: 0, flaccActivity: 2, flaccCry: 1, flaccConsolability: 1, fpsrScore: 4 })
    // A child's PAED is not scored by opening the section.
    expect(saved.paedScore ?? null).toBeNull()
  } finally {
    await api.delete(`/api/cases/${id}`, { headers: JSON_HEADERS })
    await context.close()
  }
})

test("an adult's recovery observations suggest Aldrete circulation and SpO2, set only by a tap", async ({ browser }) => {
  const context = await contextFor(browser, "member-a")
  const page = await context.newPage()
  const api = context.request
  const created = await api.post("/api/cases", {
    headers: JSON_HEADERS,
    data: { preop: { ageYears: 58, sex: "FEMALE", heightCm: 165, weightKg: 70, bpSystolic: 140 } },
  })
  expect(created.status(), await created.text()).toBe(201)
  const { id } = await created.json()

  try {
    const patched = await api.patch(`/api/cases/${id}`, { headers: JSON_HEADERS, data: { postop: { recoveryBpSystolic: 100, recoverySpO2: 88 } } })
    expect(patched.ok(), await patched.text()).toBeTruthy()
    await page.goto(`/cases/new?continue=${id}&step=2`)
    await expect(page.getByTestId("pain-scales-offered")).toContainText("NRS", { timeout: 20_000 })

    // 100 against 140 is 29% away: circulation 1. 88% is below 90: SpO2 0.
    const circulation = page.getByTestId("suggest-aldreteCirculation")
    await expect(circulation).toContainText("1")
    await expect(page.getByTestId("suggest-aldreteSpO2")).toContainText("0")
    await page.waitForTimeout(2_500)
    expect((await postopOf(api, id)).aldreteCirculation ?? null).toBeNull()

    await circulation.getByRole("button").click()
    await expect(circulation).toHaveCount(0)
    await expect.poll(async () => (await postopOf(api, id)).aldreteCirculation, { timeout: 15_000 }).toBe(1)

    // NRS is eleven buttons, not a slider.
    await expect(page.getByTestId("nrs-scale").getByRole("button")).toHaveCount(11)
  } finally {
    await api.delete(`/api/cases/${id}`, { headers: JSON_HEADERS })
    await context.close()
  }
})
