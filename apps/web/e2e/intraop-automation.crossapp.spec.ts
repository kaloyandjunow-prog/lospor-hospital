import fs from "node:fs"
import path from "node:path"
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test"
import { contextFor, JSON_HEADERS } from "./roles"
import { E2E_MEMBER_A_EMAIL } from "./credentials"
import { openPhone, openPhoneIntraop } from "./pwa"
import { withIntraopAutomation } from "./automation-setup"

// Intraoperative automation (10.1.0) across both apps: the vitals questions,
// timed complications, shocks, End at and end corrections, with the review
// screens written to REVIEW_SHOTS_DIR (one folder per language) when it is set.

test.describe.configure({ timeout: 600_000 })
// A wrong selector fails in seconds rather than at the test timeout.
test.use({ actionTimeout: 15_000 })

type Locale = "en" | "bg"
const LOCALES: Locale[] = (process.env.REVIEW_LOCALES?.split(",") as Locale[] | undefined) ?? ["en", "bg"]
const SHOTS = process.env.REVIEW_SHOTS_DIR

async function shot(page: Page, locale: Locale, name: string, fullPage = false) {
  if (!SHOTS) return
  const dir = path.join(SHOTS, locale)
  fs.mkdirSync(dir, { recursive: true })
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {})
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage })
}

const PREOP = {
  ageYears: 58, sex: "MALE" as const, heightCm: 176, weightKg: 82, clinicalMode: "ADULT",
  diagnoses: [{ label: "Cholelithiasis" }], procedures: [{ label: "Laparoscopic cholecystectomy" }],
  bpSystolic: 132, bpDiastolic: 78, heartRate: 72, respiratoryRate: 14, mallampati: "II" as const, asaScore: "II" as const,
}

const at = (minutesAgo: number) => new Date(Math.floor((Date.now() - minutesAgo * 60_000) / 300_000) * 300_000).toISOString()

async function startedCase(request: APIRequestContext, startedAt: string, preop: Record<string, unknown> = PREOP): Promise<string> {
  const created = await request.post("/api/cases", {
    headers: JSON_HEADERS,
    data: {
      preop,
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

/** The phone opens on its first tab; the questions and the rows live on the timetable. */
async function timetable(page: Page, locale: Locale) {
  await page.getByText(locale === "bg" ? "Времева линия" : "Timetable", { exact: true }).first().click()
  await page.waitForTimeout(600)
}

/** Opens the current slot, unless a save has left it open already. */
async function nowSlot(page: Page) {
  // The PWA draws the live now-line inside this row and updates its position
  // continuously. A normal Playwright click waits for a stable bounding box
  // forever even though the TouchableOpacity itself is the intended target.
  if (await page.getByTestId("timetable-quick-add-event").count() === 0) await page.getByTestId("timetable-row-now").click({ force: true })
  await page.getByTestId("timetable-quick-add-event").click()
}

/** Signing the phone in sets the account to English: say the language again afterwards. */
async function phoneIn(browser: Browser, request: APIRequestContext, locale: Locale) {
  const phone = await openPhone(browser, E2E_MEMBER_A_EMAIL)
  await request.patch("/api/user", { headers: JSON_HEADERS, data: { preferences: { ui: { locale } } } })
  return phone
}

async function intraop(request: APIRequestContext, caseId: string): Promise<Record<string, unknown>> {
  return ((await (await request.get(`/api/cases/${caseId}`)).json()) as { intraop?: Record<string, unknown> }).intraop ?? {}
}

for (const locale of LOCALES) {
  test(`intraoperative automation across both apps (${locale})`, async ({ browser }) => {
    const web = await contextFor(browser, "member-a")
    await web.request.patch("/api/user", { headers: JSON_HEADERS, data: { preferences: { ui: { locale } } } })
    const automation = await withIntraopAutomation({ enabled: true, vitalQuestions: { enabled: true } })
    try {
      // ── Phone: a question from the vitals, answered, and its episode closed ──
      const caseA = await startedCase(web.request, at(40))
      await chart(web.request, caseA, { id: "low-hr", type: "vital", ts: at(10), heartRate: 44, systolic: 118, diastolic: 70 })
      const phone = await phoneIn(browser, web.request, locale)
      await openPhoneIntraop(phone.page, caseA, locale)
      await timetable(phone.page, locale)
      const key = "vital:bradycardia:low-hr"
      await expect(phone.page.getByTestId(`attention-vital-detail-${key}`)).toBeVisible({ timeout: 20_000 })
      await shot(phone.page, locale, "pwa-vitals-question")
      await phone.page.getByTestId(`attention-vital-log-${key}`).click()
      await expect.poll(async () => (await events(web.request, caseA)).find(event => event.type === "complication")?.complicationSource, { timeout: 20_000 }).toBe("vitals")

      // A timed complication from the slot sheet.
      await timetable(phone.page, locale)
      await nowSlot(phone.page)
      // The selector is one quiet list (10.2.0): open Complications, then the event.
      await phone.page.getByTestId("event-category-Complications").click()
      await phone.page.getByText(locale === "bg" ? "Ларингоспазъм" : "Laryngospasm", { exact: true }).click()
      await expect.poll(async () => (await events(web.request, caseA)).filter(event => event.type === "complication").length, { timeout: 20_000 }).toBe(2)

      // A shock.
      await nowSlot(phone.page)
      await phone.page.getByTestId("slot-defibrillation").click()
      for (let i = 0; i < 15; i += 1) await phone.page.getByTestId("defib-step-10").click()
      await phone.page.getByTestId("defib-sync").click()
      await shot(phone.page, locale, "pwa-defibrillation")
      await phone.page.getByTestId("defib-save").click()
      await expect.poll(async () => (await events(web.request, caseA)).find(event => event.type === "defibrillation"), { timeout: 20_000 })
        .toMatchObject({ energyJ: 150, synchronized: true })

      // The complications list: both timed entries, view and delete only.
      await phone.page.getByText(locale === "bg" ? "Дневник на събитията" : "Event log", { exact: true }).first().click()
      await expect(phone.page.getByTestId(/^complication-event:/).first()).toBeVisible()
      await shot(phone.page, locale, "pwa-complications")

      // A normal reading closes the episode at its time.
      await chart(web.request, caseA, { id: "back-hr", type: "vital", ts: at(5), heartRate: 72, systolic: 120, diastolic: 72 })
      await openPhoneIntraop(phone.page, caseA, locale)
      await timetable(phone.page, locale)
      await expect.poll(async () => (await events(web.request, caseA)).find(event => event.complicationSource === "vitals")?.endTs, { timeout: 20_000 }).toBe(at(5))
      await phone.context.close()

      // ── Phone: End at, for a case charted three days later ──
      // Pick three calendar days back in the case zone. Subtracting 72 UTC
      // hours crosses the wrong local date when the run starts near midnight.
      const start = new Date()
      start.setDate(start.getDate() - 3)
      start.setHours(9, 0, 0, 0)
      const caseB = await startedCase(web.request, start.toISOString())
      const late = await phoneIn(browser, web.request, locale)
      await openPhoneIntraop(late.page, caseB, locale)
      await timetable(late.page, locale)
      // Sections left incomplete are a warning to continue past, not the subject here.
      late.page.on("dialog", dialog => { console.log(`End case dialog: ${dialog.message()}`); void dialog.accept() })
      await late.page.getByTestId("timetable-end-case").click()
      await late.page.getByTestId("end-case-mode-at").click()
      const back = late.page.getByLabel(locale === "bg" ? "Дата на край: −1" : "End date: −1")
      for (let i = 0; i < 3; i += 1) await back.click()
      await late.page.getByTestId("end-case-at-time").fill("11:00")
      await shot(late.page, locale, "pwa-end-at")
      await late.page.getByTestId("end-case-finalize").click()
      const expectedEnd = new Date(start.getTime() + 2 * 3_600_000).toISOString()
      await expect.poll(async () => (await intraop(web.request, caseB)).endedAt, { timeout: 20_000 }).toBe(expectedEnd)
      await late.context.close()

      // ── Web: the same question, the shock dialog, the complications and an end correction ──
      const caseC = await startedCase(web.request, at(40))
      await chart(web.request, caseC, { id: "web-low-hr", type: "vital", ts: at(10), heartRate: 44, systolic: 118, diastolic: 70 })
      await chart(web.request, caseC, { id: "web-complication", type: "complication", ts: at(20), label: "Bronchospasm", color: "#ef4444", complicationSource: "timeline" })
      const page = await web.newPage()
      await page.goto(`/cases/new?continue=${caseC}&step=1`, { waitUntil: "domcontentloaded" })
      await expect(page.getByTestId("attention-detail-vital:bradycardia:web-low-hr")).toBeVisible({ timeout: 30_000 })
      await shot(page, locale, "web-vitals-question")
      await page.locator("[data-testid^='events-lane-col-']").nth(2).click()
      await page.getByTestId("event-picker-defibrillation").click()
      for (let i = 0; i < 20; i += 1) await page.getByTestId("defib-step-10").click()
      await page.getByTestId("defib-unsync").click()
      await shot(page, locale, "web-defibrillation")
      await page.getByTestId("defib-save").click()
      await expect.poll(async () => (await events(web.request, caseC)).find(event => event.type === "defibrillation"), { timeout: 20_000 })
        .toMatchObject({ energyJ: 200, synchronized: false })

      // End the case, then move its end: the reason comes first.
      const endedAt = at(2)
      const ended = await web.request.patch(`/api/cases/${caseC}`, { headers: JSON_HEADERS, data: { intraop: { endedAt } } })
      expect(ended.ok(), await ended.text()).toBe(true)
      await page.reload({ waitUntil: "domcontentloaded" })
      await page.getByTestId("intraop-end-day").scrollIntoViewIfNeeded()
      await page.getByTestId("intraop-end-day").locator("button").nth(1).click()
      await expect(page.getByTestId("end-correction-reasons")).toBeVisible()
      await shot(page, locale, "web-end-correction")
      await page.getByTestId("end-correction-cancel").click()

      // The unit indicators show the limits the questions use.
      await page.goto("/indicators", { waitUntil: "domcontentloaded" })
      await expect(page.getByTestId("vital-limits")).toBeVisible({ timeout: 30_000 })
      await page.getByTestId("vital-limits").scrollIntoViewIfNeeded()
      await shot(page, locale, "web-unit-indicators-limits")
    } finally {
      await automation.restore()
      await web.close()
    }
  })
}
