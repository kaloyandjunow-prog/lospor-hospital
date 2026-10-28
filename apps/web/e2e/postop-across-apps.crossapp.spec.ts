import path from "path"
import { test, expect, type BrowserContext, type Page } from "@playwright/test"
import { contextFor, JSON_HEADERS } from "./roles"
import { E2E_MEMBER_A_EMAIL } from "./credentials"
import { openPhone } from "./pwa"

// The phone's postoperative form in sections (10.0.0): a strip of four
// sections, pain by the scales the age calls for, scored item by item, the
// Aldrete suggestions set only by a tap, and PONV that can be taken back to
// "not recorded". Each step is checked against the server.

test.describe.configure({ timeout: 240_000 })

const SHOTS = process.env.POSTOP_SHOTS_DIR ?? path.join(__dirname, "..", "test-results", "postop-shots")
async function shot(page: Page, name: string) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

async function createCase(web: BrowserContext, data: Record<string, unknown>): Promise<string> {
  const response = await web.request.post("/api/cases", { headers: JSON_HEADERS, data })
  expect(response.status(), await response.text()).toBe(201)
  return (await response.json() as { id: string }).id
}

async function postopOf(web: BrowserContext, id: string): Promise<Record<string, unknown>> {
  return (await (await web.request.get(`/api/cases/${id}`)).json() as { postop?: Record<string, unknown> }).postop ?? {}
}

async function openPostop(page: Page, id: string, layout: "sections" | "scroll") {
  await page.addInitScript(value => window.localStorage.setItem("lospor_ss_lospor_preop_layout", value), layout)
  await page.goto(`/cases/postop/${id}`)
  await expect(page.getByTestId("postop-pill-score")).toBeVisible({ timeout: 60_000 })
}

test("a child of three on the phone: FLACC and FPS-R in the Pain section, one section at a time", async ({ browser }) => {
  const web = await contextFor(browser, "member-a")
  const id = await createCase(web, { clinicalMode: "PEDIATRIC", preop: { ageValue: 3, ageUnit: "YEARS", sex: "FEMALE", heightCm: 96, weightKg: 14 } })
  const { context, page } = await openPhone(browser, E2E_MEMBER_A_EMAIL)
  try {
    await openPostop(page, id, "sections")
    for (const key of ["vitals", "score", "pain", "discharge"]) await expect(page.getByTestId(`postop-pill-${key}`)).toBeVisible()
    // One section at a time: the pain scales are not on the first one.
    await expect(page.getByTestId("flacc-scale")).toHaveCount(0)
    await shot(page, "child-vitals")

    await page.getByTestId("postop-pill-pain").click()
    await expect(page.getByTestId("pain-scales-offered")).toContainText("FLACC, FPS-R")
    await expect(page.getByTestId("nips-scale")).toHaveCount(0)
    await expect(page.getByTestId("paed-scale")).toBeVisible()
    const flacc = page.getByTestId("flacc-scale")
    for (const [row, answer] of [[0, 2], [1, 1], [2, 1], [3, 0], [4, 1]] as const) {
      await flacc.locator(":scope > div").nth(row).getByRole("button").nth(answer).click()
    }
    await expect(page.getByTestId("flacc-total")).toContainText("5")
    await page.getByRole("button", { name: "FPS-R 6" }).click()
    await shot(page, "child-pain")
    await expect.poll(async () => (await postopOf(web, id)).flaccTotal, { timeout: 20_000 }).toBe(5)
    expect(await postopOf(web, id)).toMatchObject({ flaccFace: 2, flaccLegs: 1, flaccActivity: 1, flaccCry: 0, flaccConsolability: 1, fpsrScore: 6 })

    // The recovery score is Steward, starred: it is needed to finalise.
    await page.getByTestId("postop-pill-score").click()
    await expect(page.getByText("Steward recovery score *").first()).toBeVisible()
    await shot(page, "child-score")
  } finally {
    await context.close()
    await web.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS })
    await web.close()
  }
})

test("an adult on the phone: Aldrete suggestions, NRS buttons, and PONV that can be taken back", async ({ browser }) => {
  const web = await contextFor(browser, "member-a")
  const id = await createCase(web, { preop: { ageYears: 66, sex: "MALE", heightCm: 176, weightKg: 81, bpSystolic: 150 } })
  const patched = await web.request.patch(`/api/cases/${id}`, { headers: JSON_HEADERS, data: { postop: { recoveryBpSystolic: 140, recoverySpO2: 91 } } })
  expect(patched.ok(), await patched.text()).toBeTruthy()
  const { context, page } = await openPhone(browser, E2E_MEMBER_A_EMAIL)
  try {
    await openPostop(page, id, "scroll")
    // Scrolling layout: every section on one page.
    await expect(page.getByTestId("nrs-scale")).toBeVisible()
    await expect(page.getByTestId("nrs-scale").getByRole("button")).toHaveCount(11)

    // 140 against 150 is within 20%: circulation 2. 91% is 90-92: SpO2 1.
    const circulation = page.getByTestId("suggest-aldreteCirculation")
    await expect(circulation).toContainText("2")
    await expect(page.getByTestId("suggest-aldreteSpO2")).toContainText("1")
    await shot(page, "adult-scroll")
    await circulation.getByRole("button").click({ timeout: 15_000 })
    await expect(circulation).toHaveCount(0)
    await expect.poll(async () => (await postopOf(web, id)).aldreteCirculation, { timeout: 20_000 }).toBe(2)
    expect((await postopOf(web, id)).aldreteSpO2 ?? null).toBeNull()

    await page.getByTestId("ponv-yes").click({ timeout: 15_000 })
    await expect.poll(async () => (await postopOf(web, id)).ponv, { timeout: 20_000 }).toBe(true)
    await page.getByTestId("ponv-yes").click({ timeout: 15_000 })
    await expect.poll(async () => (await postopOf(web, id)).ponv ?? null, { timeout: 20_000 }).toBeNull()
  } finally {
    await context.close()
    await web.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS })
    await web.close()
  }
})
