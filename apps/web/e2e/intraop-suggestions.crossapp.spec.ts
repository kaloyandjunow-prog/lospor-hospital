import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test"
import { contextFor, JSON_HEADERS } from "./roles"
import { E2E_MEMBER_A_EMAIL } from "./credentials"
import { openPhone, openPhoneIntraop } from "./pwa"
import { withIntraopAutomation } from "./automation-setup"

// SPS (10.2.0) across both apps and the API: a waiting
// card that opens, a dose the card prefills and the entry it saves with the
// card's tag, the dantrolene vials, the jet bar, and the clinician's own
// switches -- each charted in one app and read back from the API.

test.describe.configure({ timeout: 600_000 })
test.use({ actionTimeout: 15_000 })

const PREOP = {
  ageYears: 45, sex: "MALE" as const, heightCm: 182, weightKg: 140, clinicalMode: "ADULT",
  diagnoses: [{ label: "Cholelithiasis" }], procedures: [{ label: "Laparoscopic cholecystectomy" }],
  bpSystolic: 132, bpDiastolic: 78, heartRate: 72, respiratoryRate: 14, mallampati: "II" as const, asaScore: "II" as const,
}

const AUTOMATION = {
  enabled: true,
  vitalQuestions: { enabled: true },
  groups: { treatmentSuggestions: true, reverseQuestions: true, readingQuestions: true, labQuestions: true, reminders: true, timers: true },
  dantroleneVialsMg: [20, 250],
}

// Whole 5-minute marks, as the chart's rows are.
const at = (minutesAgo: number) => new Date(Math.floor((Date.now() - minutesAgo * 60_000) / 300_000) * 300_000).toISOString()

async function startedCase(request: APIRequestContext, startedAt: string): Promise<string> {
  const created = await request.post("/api/cases", {
    headers: JSON_HEADERS,
    data: {
      preop: PREOP,
      intraop: { startedAt, timezone: "Europe/Sofia", techniques: ["GENERAL_TIVA"], nbpMonitor: true, ecg: true, spO2Monitor: true },
    },
  })
  expect(created.ok(), await created.text()).toBe(true)
  return (await created.json() as { id: string }).id
}

async function chart(request: APIRequestContext, caseId: string, event: Record<string, unknown>) {
  const saved = await request.post(`/api/cases/${caseId}/events`, { headers: JSON_HEADERS, data: event })
  expect(saved.ok(), await saved.text()).toBe(true)
}

async function events(request: APIRequestContext, caseId: string): Promise<Record<string, unknown>[]> {
  const body = await (await request.get(`/api/cases/${caseId}`)).json() as { intraop?: { keyEvents?: { log?: Record<string, unknown>[] } } }
  return body.intraop?.keyEvents?.log ?? []
}

const complication = (id: string, label: string, minutesAgo: number) =>
  ({ id, type: "complication", ts: at(minutesAgo), label, color: "#ef4444", complicationSource: "timeline" })

async function timetable(page: Page) {
  await page.getByText("Timetable", { exact: true }).first().click()
  await page.waitForTimeout(600)
}

async function phoneIn(browser: Browser, request: APIRequestContext) {
  const phone = await openPhone(browser, E2E_MEMBER_A_EMAIL)
  await request.patch("/api/user", { headers: JSON_HEADERS, data: { preferences: { ui: { locale: "en" } } } })
  return phone
}

test("suggestions on the web: a waiting card opens, prefills a dose and tags what it saves", async ({ browser }) => {
  const web = await contextFor(browser, "member-a")
  await web.request.patch("/api/user", { headers: JSON_HEADERS, data: { preferences: { ui: { locale: "en" } } } })
  const automation = await withIntraopAutomation(AUTOMATION)
  try {
    const caseId = await startedCase(web.request, at(40))
    await chart(web.request, caseId, complication("hypo", "Hypotension", 10))
    const page = await web.newPage()
    await page.goto(`/cases/new?continue=${caseId}&step=1`, { waitUntil: "domcontentloaded" })

    // The card waits as one line with Open and Not now.
    await expect(page.getByTestId("attention-open-card:hypo")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId("attention-not_now-card:hypo")).toBeVisible()
    await page.getByTestId("attention-open-card:hypo").click()
    await expect(page.getByTestId("suggestion-card")).toBeVisible()
    await expect(page.getByTestId("card-row-ephedrine")).toContainText("10 mg")

    // A drug row opens the dosing sheet, prefilled; saving tags the entry with the card.
    await page.getByTestId("card-row-ephedrine").locator("button").first().click()
    // The controls open under the row, inside the card: the screen does not change.
    await expect(page.getByTestId("card-row-ephedrine").getByTestId("card-inline-dose")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId("suggestion-card")).toBeVisible()
    await page.getByRole("button", { name: /^administer$/i }).click({ timeout: 30_000 })
    await expect.poll(async () => (await events(web.request, caseId)).find(event => event.type === "drug" && event.name === "Ephedrine"), { timeout: 20_000 })
      .toMatchObject({ dose: "10", suggestion: "card:Hypotension:ephedrine" })
    // The row shows what was given, and the card closes with Not now.
    await expect(page.getByTestId("card-used-ephedrine")).toBeVisible({ timeout: 20_000 })
    await page.getByTestId("suggestion-card-not-now").click()
    await expect.poll(async () => (await events(web.request, caseId)).find(event => event.type === "prompt_answer"), { timeout: 20_000 })
      .toMatchObject({ answerKind: "card", answerFor: "hypo", answer: "not_now" })
  } finally {
    await automation.restore()
    await web.close()
  }
})

test("the dantrolene vials on the MH card, web and phone", async ({ browser }) => {
  const web = await contextFor(browser, "member-a")
  await web.request.patch("/api/user", { headers: JSON_HEADERS, data: { preferences: { ui: { locale: "en" } } } })
  const automation = await withIntraopAutomation(AUTOMATION)
  try {
    const caseId = await startedCase(web.request, at(40))
    await chart(web.request, caseId, complication("mh", "Malignant hyperthermia", 10))

    // Web: 2.5 mg/kg of 140 kg is 350 mg, from the 250 and 20 mg vials the hospital stocks.
    const page = await web.newPage()
    await page.goto(`/cases/new?continue=${caseId}&step=1`, { waitUntil: "domcontentloaded" })
    await page.getByTestId("attention-open-card:mh").click({ timeout: 30_000 })
    await expect(page.getByTestId("vials-dose")).toHaveText("350 mg")
    await expect(page.getByTestId("vials-plan")).toHaveText("1 × 250 mg  +  5 × 20 mg")
    await expect(page.getByTestId("dantrolene-vial")).toHaveCount(6)
    // Stepping the dose refills the vials and rearranges the mix.
    await page.getByTestId("vials-dec").click()
    await page.getByTestId("vials-dec").click()
    await expect(page.getByTestId("vials-dose")).toHaveText("210 mg")
    await expect(page.getByTestId("vials-plan")).toHaveText("11 × 20 mg")
    await expect(page.getByTestId("dantrolene-vial")).toHaveCount(11)

    // Phone: the same vials, on a case of its own -- the web page holds the first, and a
    // screen watching another screen's case asks nothing.
    const phoneCase = await startedCase(web.request, at(40))
    await chart(web.request, phoneCase, complication("mh", "Malignant hyperthermia", 10))
    const phone = await phoneIn(browser, web.request)
    await openPhoneIntraop(phone.page, phoneCase, "en")
    await timetable(phone.page)
    await phone.page.getByTestId("attention-suggestion-open-card:mh").click({ timeout: 30_000 })
    await expect(phone.page.getByTestId("vials-dose")).toContainText("350")
    await expect(phone.page.getByTestId("vials-plan")).toContainText("1 × 250 mg  +  5 × 20 mg")
    await phone.page.getByTestId("vials-inc").click()
    await expect(phone.page.getByTestId("vials-dose")).toContainText("420")
    await phone.context.close()
  } finally {
    await automation.restore()
    await web.close()
  }
})

test("jet ventilation: the web row and the phone's strip", async ({ browser }) => {
  const web = await contextFor(browser, "member-a")
  await web.request.patch("/api/user", { headers: JSON_HEADERS, data: { preferences: { ui: { locale: "en" } } } })
  try {
    const caseId = await startedCase(web.request, at(40))
    await chart(web.request, caseId, { id: "jet1", type: "jet_start", ts: at(25), jetPressureBar: 2, jetRate: 150, fio2: 100 })
    await chart(web.request, caseId, { id: "jet2", type: "jet_change", ts: at(15), jetRate: 300 })
    await expect.poll(async () => (await events(web.request, caseId)).filter(event => String(event.type).startsWith("jet_")).length).toBe(2)

    const page = await web.newPage()
    await page.goto(`/cases/new?continue=${caseId}&step=1`, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("jet-lane")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId("jet-lane")).toContainText("2 bar · 150/min")
    await expect(page.getByTestId("jet-lane")).toContainText("2 bar · 300/min")

    const phone = await phoneIn(browser, web.request)
    await openPhoneIntraop(phone.page, caseId, "en")
    await timetable(phone.page)
    await phone.page.getByTestId("timetable-row-now").click()
    await expect(phone.page.getByText("Jet 2 bar · 300/min · FiO2 100%")).toBeVisible({ timeout: 20_000 })
    await phone.context.close()
  } finally {
    await web.close()
  }
})

test("the clinician's own switches reach the API and survive a round trip", async ({ browser }) => {
  const web = await contextFor(browser, "member-a")
  try {
    const patched = await web.request.patch("/api/user", { headers: JSON_HEADERS, data: { preferences: { automationGroups: { timers: false, reminders: true }, energyKnobSkin: "C" } } })
    expect(patched.ok(), await patched.text()).toBe(true)
    const body = await (await web.request.get("/api/user")).json() as { clinicalPreferences?: { automationGroups?: Record<string, boolean>; energyKnobSkin?: string } }
    expect(body.clinicalPreferences?.automationGroups).toEqual({ timers: false })
    expect(body.clinicalPreferences?.energyKnobSkin).toBe("C")
    const refused = await web.request.patch("/api/user", { headers: JSON_HEADERS, data: { preferences: { energyKnobSkin: "Z" } } })
    expect(refused.status()).toBe(400)
  } finally {
    await web.request.patch("/api/user", { headers: JSON_HEADERS, data: { preferences: { automationGroups: {}, energyKnobSkin: "A" } } })
    await web.close()
  }
})
