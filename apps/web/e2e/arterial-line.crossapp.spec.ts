import { test, expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test"
import { contextFor, JSON_HEADERS } from "./roles"
import { SYNTHETIC_MONTH, sofia, sofiaIso } from "./synthetic-day"
import { E2E_MEMBER_A_EMAIL } from "./credentials"
import { openPhone, openPhoneIntraop } from "./pwa"

// The arterial line reads its own pressure (10.2.0), in both apps and the API: the phone's vitals
// sheet shows the IBP block only while the invasive pressure monitor is ticked and saves the four new
// fields beside the cuff pair, and the web chart shows the IBP lanes and the readings from the record.

test.describe.configure({ timeout: 600_000 })
test.use({ actionTimeout: 15_000 })

const STARTED_AT = sofiaIso(8, 55) // 08:55 in Europe/Sofia, yesterday
const SYNTHETIC_END_NOW = sofia(10, 0, 30)
const PREOP = {
  ageYears: 44, sex: "MALE" as const, heightCm: 180, weightKg: 82, clinicalMode: "ADULT",
  diagnoses: [{ label: "Cholelithiasis" }], procedures: [{ label: "Laparoscopic cholecystectomy" }],
  bpSystolic: 132, bpDiastolic: 78, heartRate: 72, respiratoryRate: 14, mallampati: "II" as const, asaScore: "II" as const,
}

type Vital = { type?: string; systolic?: number; diastolic?: number; ibpSystolic?: number; ibpDiastolic?: number; ibpMap?: number; nibpMap?: number }
type CaseBody = { intraop?: { syncRevision?: number; keyEvents?: { log?: Vital[] } } }

async function startedCase(context: BrowserContext, invasiveBP: boolean): Promise<string> {
  const created = await context.request.post("/api/cases", {
    headers: JSON_HEADERS,
    data: {
      preop: PREOP,
      intraop: { monthYear: SYNTHETIC_MONTH, startTime: "08:55", startedAt: STARTED_AT, timezone: "Europe/Sofia", techniques: ["GENERAL_TIVA"], nbpMonitor: true, ecg: true, spO2Monitor: true, invasiveBP },
    },
  })
  expect(created.ok(), await created.text()).toBe(true)
  return (await created.json() as { id: string }).id
}

async function caseBody(request: APIRequestContext, caseId: string): Promise<CaseBody> {
  const response = await request.get(`/api/cases/${caseId}`)
  expect(response.status(), await response.text()).toBe(200)
  return response.json() as Promise<CaseBody>
}

async function openVitalsSheet(phone: Page, caseId: string) {
  await phone.clock.install({ time: SYNTHETIC_END_NOW })
  await openPhoneIntraop(phone, caseId)
  await phone.getByText("Timetable", { exact: true }).first().click()
  await phone.getByText("09:00", { exact: true }).first().click()
  await phone.getByText("Vitals", { exact: true }).first().click()
}

test("the phone shows the IBP block only while the invasive pressure monitor is ticked", async ({ browser }) => {
  const web = await contextFor(browser, "member-a")
  const without = await startedCase(web, false)
  const withIbp = await startedCase(web, true)
  const { context, page: phone } = await openPhone(browser, E2E_MEMBER_A_EMAIL)
  try {
    await openVitalsSheet(phone, without)
    await expect(phone.getByPlaceholder("Sys")).toBeVisible({ timeout: 30_000 })
    await expect(phone.getByTestId("vitals-nibp-map")).toBeVisible()
    await expect(phone.getByTestId("vitals-ibp")).toHaveCount(0)
    await phone.close()

    const second = await context.newPage()
    await openVitalsSheet(second, withIbp)
    await expect(second.getByTestId("vitals-ibp")).toBeVisible({ timeout: 30_000 })
    await expect(second.getByText("NIBP (cuff)")).toBeVisible()
  } finally {
    await context.close().catch(() => {})
    await web.close().catch(() => {})
  }
})

test("an IBP reading entered on the phone reaches the record and the web chart", async ({ browser }) => {
  const web = await contextFor(browser, "member-a")
  const caseId = await startedCase(web, true)
  const { context, page: phone } = await openPhone(browser, E2E_MEMBER_A_EMAIL)
  try {
    await openVitalsSheet(phone, caseId)
    await phone.getByPlaceholder("Sys").fill("123")
    await phone.getByPlaceholder("Dia").fill("77")
    await phone.getByTestId("vitals-nibp-map").fill("92")
    await phone.getByTestId("vitals-ibp-systolic").fill("131")
    await phone.getByTestId("vitals-ibp-diastolic").fill("70")
    await phone.getByTestId("vitals-ibp-map").fill("90")
    await phone.getByText("Save vitals", { exact: true }).click()

    // Saved as one vital event: the cuff pair and the four new fields together.
    await expect.poll(async () => ((await caseBody(web.request, caseId)).intraop?.keyEvents?.log ?? []).find(event => event.type === "vital" && event.ibpSystolic === 131), { timeout: 60_000 })
      .toMatchObject({ systolic: 123, diastolic: 77, nibpMap: 92, ibpSystolic: 131, ibpDiastolic: 70, ibpMap: 90 })

    // The web chart gets the IBP lanes, labelled, with the reading in them.
    const page = await web.newPage()
    await page.clock.install({ time: SYNTHETIC_END_NOW })
    await page.addInitScript(() => window.localStorage.setItem("tourCompleted", "1"))
    await page.goto(`/cases/new?continue=${caseId}&step=1`, { waitUntil: "domcontentloaded" })
    const tab = page.getByRole("tab", { name: "Chart" })
    if (await tab.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false)) await tab.click()
    const chart = page.locator('[data-tour="intraop-timetable"]')
    await expect(chart).toBeVisible({ timeout: 60_000 })
    await expect(chart.getByText("IBP Sys").first()).toBeVisible({ timeout: 30_000 })
    await expect(chart.getByText("NIBP Sys").first()).toBeVisible()
    await expect(chart.locator('[title="131"]').first()).toBeVisible({ timeout: 30_000 })
    await expect(chart.locator('[title="123"]').first()).toBeVisible()
  } finally {
    await context.close().catch(() => {})
    await web.close().catch(() => {})
  }
})
