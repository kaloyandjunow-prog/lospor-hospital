import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, request, test, type APIRequestContext, type Browser, type Locator, type Page } from "@playwright/test"
import { E2E_MEMBER_A_USERNAME } from "./credentials"
import { STATUS_E2E_BASE, STATUS_E2E_PASSWORD, STATUS_E2E_SESSION_FILE } from "./fixtures/status-e2e"
import { openPhone, openPhonePreop, settle } from "./pwa"
import { contextFor, JSON_HEADERS } from "./roles"

// One preoperative profile for adults and one for children (1.5.5), changed
// the way an operator changes them: in the Status editor, in a browser. Then
// the clinician's web form and phone form are read for an adult and a
// paediatric case. Before 1.5.5 no test moved a question and looked at a real
// form, so a reorder that changed nothing on screen went unnoticed.

type Settings = { enabled: boolean; required: boolean; sortOrder: number }
type ProfileQuestion = Settings & { stableKey: string; applicability: string[]; byMode?: Partial<Record<Population, Settings>> }
type Population = "ADULT" | "PEDIATRIC"

const OXYGEN = "P2_HOME_OXYGEN_NIV"
const PREMATURITY = "P1_PREMATURITY_NICU"
const LATEX = "BASE_LATEX_ALLERGY"
const ARRHYTHMIA = "BASE_HEART_ARRHYTHMIA"

const CHILD = {
  ageValue: 7, ageUnit: "YEARS" as const, sex: "MALE" as const, heightCm: 122, weightKg: 24,
  diagnoses: [{ label: "Recurrent tonsillitis" }], procedures: [{ label: "Tonsillectomy" }],
}
const ADULT = {
  ageYears: 44, sex: "MALE" as const, heightCm: 180, weightKg: 82,
  diagnoses: [{ label: "Cholelithiasis" }], procedures: [{ label: "Laparoscopic cholecystectomy" }],
}

async function readProfile(api: APIRequestContext): Promise<ProfileQuestion[]> {
  const response = await api.get("/api/preop/profile")
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json() as { questions: ProfileQuestion[] }).questions
}

const settingsOf = (questions: ProfileQuestion[], population: Population, stableKey: string) =>
  questions.find(question => question.stableKey === stableKey)?.byMode?.[population]

/** Puts a population's profile back as it was, through the control plane. */
async function restore(questions: ProfileQuestion[], population: Population) {
  const token = readFileSync(path.join(__dirname, "fixtures", "status-account-control-token"), "utf8").trim()
  const control = await request.newContext({ baseURL: process.env.E2E_API_BASE })
  try {
    const response = await control.post("/v1/internal/hospital/control-plane/preop-profile", {
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      data: {
        population,
        reason: "E2E: restore the profile after the Status editor test",
        questions: questions.filter(question => question.byMode?.[population])
          .map(question => ({ stableKey: question.stableKey, ...question.byMode![population]! })),
      },
    })
    expect(response.ok(), await response.text()).toBeTruthy()
  } finally {
    await control.dispose()
  }
}

async function openStatusEditor(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: STATUS_E2E_BASE })
  await context.addCookies([
    { name: "lospor_status_session", value: readFileSync(STATUS_E2E_SESSION_FILE, "utf8").trim(), url: STATUS_E2E_BASE },
    { name: "lospor_status_locale", value: "en", url: STATUS_E2E_BASE },
  ])
  const page = await context.newPage()
  await page.goto("/status/control/clinical#preop-children")
  await expect(page.locator("#preop-children")).toBeVisible()
  return page
}

/** Fills the reason and password and saves this population's form, as an operator does. */
async function save(editor: Locator, reason: string) {
  await editor.locator('input[name="reason"]').fill(reason)
  await editor.locator('input[name="password"]').fill(STATUS_E2E_PASSWORD)
  await editor.locator('button[type="submit"]').click()
  await expect(editor.page().getByText("The preoperative profile was saved")).toBeVisible()
}

/** The generic questions a form draws, in the order it draws them. */
async function drawnOrder(page: Page, prefix: string): Promise<string[]> {
  const ids = await page.locator(`[data-testid^="preop-question-${prefix}"]`).evaluateAll(elements =>
    elements.map(element => element.getAttribute("data-testid")!.replace("preop-question-", "")))
  return [...new Set(ids.filter(id => !id.includes("-")))]
}

async function caseRead(api: APIRequestContext, caseId: string) {
  const response = await api.get("/api/cases/" + caseId)
  expect(response.ok(), await response.text()).toBeTruthy()
  return await response.json() as { preopRequiredMissing?: Array<{ stableKey: string }> }
}

test.describe("adult and children's preoperative profiles, edited in Status", () => {
  test("reorder, require and then switch off a children's question; adults are untouched", async ({ browser }) => {
    const web = await contextFor(browser, "member-a")
    const original = await readProfile(web.request)
    const create = async (clinicalMode: Population, preop: Record<string, unknown>) => {
      const response = await web.request.post("/api/cases", {
        headers: JSON_HEADERS,
        data: { patientNumber: `PREOP-PROFILES-${clinicalMode}-${Date.now()}`, clinicalMode, preop },
      })
      expect(response.status(), await response.text()).toBe(201)
      return (await response.json() as { id: string }).id
    }
    const childCase = await create("PEDIATRIC", CHILD)
    const adultCase = await create("ADULT", ADULT)
    const status = await openStatusEditor(browser)
    const children = status.locator("#preop-children")
    const adults = status.locator("#preop-adults")
    try {
      // Baseline questions are fixed in the form: listed, but not draggable.
      await status.goto("/status/control/clinical#preop-adults")
      await expect(adults.locator(`[data-preop-order-row][data-stable-key="${ARRHYTHMIA}"]`)).toHaveCount(0)
      await expect(adults.locator(`input[type="hidden"][name="order_${ARRHYTHMIA}"]`)).toHaveCount(1)
      await expect(adults.locator("[data-preop-order-row]").first()).toBeVisible()
      // Children's questions only in the children's editor.
      await expect(adults.locator(`[data-stable-key="${OXYGEN}"]`)).toHaveCount(0)

      // 1. Switch both on and drag "home oxygen" above "prematurity".
      await status.goto("/status/control/clinical#preop-children")
      await children.locator(`input[name="enabled_${PREMATURITY}"]`).check()
      await children.locator(`input[name="enabled_${OXYGEN}"]`).check()
      // Onto the prematurity row itself: other children's questions (since 1.6.0,
      // a previous ICU stay) may come first in the list.
      const rows = children.locator("[data-preop-order-row]")
      await children.locator(`[data-preop-order-row][data-stable-key="${OXYGEN}"] [data-drag-handle]`)
        .dragTo(children.locator(`[data-preop-order-row][data-stable-key="${PREMATURITY}"]`))
      await expect.poll(async () => {
        const keys = await rows.evaluateAll(elements => elements.map(element => element.getAttribute("data-stable-key")))
        return keys.indexOf(OXYGEN) < keys.indexOf(PREMATURITY)
      }).toBe(true)
      await save(children, "E2E: ask children about home oxygen first")

      let profile = await readProfile(web.request)
      expect(settingsOf(profile, "PEDIATRIC", OXYGEN)).toMatchObject({ enabled: true, required: false })
      expect(settingsOf(profile, "PEDIATRIC", OXYGEN)!.sortOrder)
        .toBeLessThan(settingsOf(profile, "PEDIATRIC", PREMATURITY)!.sortOrder)
      // Children-only questions have no adult settings at all.
      expect(settingsOf(profile, "ADULT", OXYGEN)).toBeUndefined()

      const webForm = await web.newPage()
      await webForm.addInitScript(() => window.localStorage.setItem("tourCompleted", "1"))
      await webForm.goto(`/cases/new?continue=${childCase}`)
      await expect(webForm.getByTestId(`preop-question-${OXYGEN}`)).toBeVisible()
      expect(await drawnOrder(webForm, "P")).toEqual([OXYGEN, PREMATURITY])

      const phone = await openPhone(browser, E2E_MEMBER_A_USERNAME)
      await openPhonePreop(phone.page, childCase, "Anamnesis")
      await expect(phone.page.getByTestId(`preop-question-${OXYGEN}`)).toBeAttached()
      expect(await drawnOrder(phone.page, "P")).toEqual([OXYGEN, PREMATURITY])

      // 2. Make it required, and latex allergy required for children only.
      await status.goto("/status/control/clinical#preop-children")
      await children.locator(`input[name="required_${OXYGEN}"]`).check()
      await children.locator(`input[name="enabled_${LATEX}"]`).check()
      await children.locator(`input[name="required_${LATEX}"]`).check()
      await save(children, "E2E: home oxygen and latex allergy required for children")

      const childMissing = (await caseRead(web.request, childCase)).preopRequiredMissing?.map(item => item.stableKey) ?? []
      expect(childMissing).toEqual(expect.arrayContaining([OXYGEN, LATEX]))
      const adultMissing = (await caseRead(web.request, adultCase)).preopRequiredMissing?.map(item => item.stableKey) ?? []
      expect(adultMissing).not.toContain(LATEX)
      await webForm.reload()
      await expect(webForm.getByTestId(`preop-question-${OXYGEN}`)).toContainText("*")

      // 3. Switch it off: "Required" clears with it, and both apps stop asking.
      await status.goto("/status/control/clinical#preop-children")
      await children.locator(`input[name="enabled_${OXYGEN}"]`).uncheck()
      await expect(children.locator(`input[name="required_${OXYGEN}"]`)).toBeDisabled()
      await save(children, "E2E: stop asking children about home oxygen")

      profile = await readProfile(web.request)
      expect(settingsOf(profile, "PEDIATRIC", OXYGEN)).toMatchObject({ enabled: false, required: false })
      expect((await caseRead(web.request, childCase)).preopRequiredMissing?.map(item => item.stableKey)).not.toContain(OXYGEN)
      await webForm.reload()
      await expect(webForm.getByTestId(`preop-question-${PREMATURITY}`)).toBeVisible()
      await expect(webForm.getByTestId(`preop-question-${OXYGEN}`)).toHaveCount(0)
      await openPhonePreop(phone.page, childCase, "Anamnesis")
      await settle(phone.page)
      await expect(phone.page.getByTestId(`preop-question-${PREMATURITY}`)).toBeAttached()
      await expect(phone.page.getByTestId(`preop-question-${OXYGEN}`)).toHaveCount(0)

      // The adult profile never moved.
      const after = await readProfile(web.request)
      for (const question of original.filter(item => item.byMode?.ADULT)) {
        expect(settingsOf(after, "ADULT", question.stableKey), question.stableKey).toEqual(question.byMode!.ADULT)
      }
      await phone.context.close()
    } finally {
      await restore(original, "PEDIATRIC").catch(() => {})
      await web.request.delete("/api/cases/" + childCase, { headers: JSON_HEADERS }).catch(() => {})
      await web.request.delete("/api/cases/" + adultCase, { headers: JSON_HEADERS }).catch(() => {})
      await status.context().close()
      await web.close()
    }
  })
})
