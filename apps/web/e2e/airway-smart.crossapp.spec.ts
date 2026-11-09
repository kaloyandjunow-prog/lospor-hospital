import { test, expect, type APIRequestContext, type Page } from "@playwright/test"
import { contextFor, JSON_HEADERS } from "./roles"
import { E2E_MEMBER_A_EMAIL } from "./credentials"
import { openPhone, openPhoneIntraop } from "./pwa"

// Smart selection (10.2.0), the Airway tab, in both apps and the API: a device
// added from the tab and read back from the record, the same panel opened by
// the timeline with that time already set, and the legacy tab for a clinician
// who chose it.

test.describe.configure({ timeout: 600_000 })
test.use({ actionTimeout: 15_000 })

const PREOP = {
  ageYears: 45, sex: "MALE" as const, heightCm: 182, weightKg: 82, clinicalMode: "ADULT",
  diagnoses: [{ label: "Cholelithiasis" }], procedures: [{ label: "Laparoscopic cholecystectomy" }],
  bpSystolic: 132, bpDiastolic: 78, heartRate: 72, respiratoryRate: 14, mallampati: "II" as const, asaScore: "II" as const,
}
const at = (minutesAgo: number) => new Date(Math.floor((Date.now() - minutesAgo * 60_000) / 300_000) * 300_000).toISOString()

async function startedCase(request: APIRequestContext): Promise<string> {
  const created = await request.post("/api/cases", {
    headers: JSON_HEADERS,
    data: { preop: PREOP, intraop: { startedAt: at(40), timezone: "Europe/Sofia", techniques: ["GENERAL_TIVA"], nbpMonitor: true, ecg: true, spO2Monitor: true } },
  })
  expect(created.ok(), await created.text()).toBe(true)
  return (await created.json() as { id: string }).id
}

type Intraop = { airwayDeviceEntries?: Array<{ device: string; status: string; details: Record<string, unknown>; instruments?: string[]; insertedAt?: string }>; oralTubeSize?: unknown; airwayDevices?: string[]; airwayTools?: string[] }
async function intraopOf(request: APIRequestContext, caseId: string): Promise<Intraop> {
  const body = await (await request.get(`/api/cases/${caseId}`)).json() as { intraop?: Intraop }
  return body.intraop ?? {}
}

async function setScreen(request: APIRequestContext, airwayScreen: "smart" | "legacy") {
  const patched = await request.patch("/api/user", { headers: JSON_HEADERS, data: { preferences: { ui: { locale: "en" }, airwayScreen } } })
  expect(patched.ok(), await patched.text()).toBe(true)
}

async function webAirway(page: Page, caseId: string) {
  await page.goto(`/cases/new?continue=${caseId}&step=1`, { waitUntil: "domcontentloaded" })
  await page.getByRole("tab", { name: "Anaesthesia" }).or(page.getByRole("button", { name: "Anaesthesia", exact: true })).first().click({ timeout: 30_000 })
}

test("Smart selection on the web: a tube added from the tab reaches the record, and the legacy tab is still there", async ({ browser }) => {
  const web = await contextFor(browser, "member-a")
  try {
    await setScreen(web.request, "smart")
    const caseId = await startedCase(web.request)
    const page = await web.newPage()
    await webAirway(page, caseId)

    // Smart keeps the common airway choices visible and puts the longer legacy
    // catalogue behind one explicit disclosure on both web and mobile.
    await expect(page.getByTestId("airway-smart")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId("airway-smart-empty")).toBeVisible()
    await expect(page.getByTestId("airway-smart-card-ORAL_ETT")).toBeVisible()
    await page.getByTestId("airway-smart-more").click()
    await expect(page.getByTestId("airway-smart-other-DOUBLE_LUMEN_TUBE")).toBeVisible()

    // The size suggested for this patient is on the card; add it, with how it was placed.
    await page.getByTestId("airway-smart-card-ORAL_ETT").click()
    await expect(page.getByTestId("airway-smart-panel")).toBeVisible()
    await page.getByTestId("airway-smart-how-VIDEO_LARY").click()
    await page.getByTestId("airway-smart-add").click()
    await expect(page.getByTestId(/^airway-smart-entry-/)).toHaveCount(1)

    // Read back from the API: the list, the tools on the tube, and the old fields it implies.
    await expect.poll(async () => (await intraopOf(web.request, caseId)).airwayDeviceEntries?.length, { timeout: 30_000 }).toBe(1)
    const saved = await intraopOf(web.request, caseId)
    expect(saved.airwayDeviceEntries![0]).toMatchObject({ device: "ORAL_ETT", status: "in_use", details: { oralTubeSize: 8, oralCuffed: true }, instruments: ["VIDEO_LARY"] })
    expect(saved.airwayDevices).toContain("ORAL_ETT")
    expect(Number(saved.oralTubeSize)).toBe(8)
    expect(saved.airwayTools).toContain("VIDEO_LARY")

    // Reintubate: both tubes are kept, the first failed.
    await page.getByTestId(/^airway-smart-reintubate-/).click()
    await page.getByTestId("airway-smart-add").click()
    await expect.poll(async () => (await intraopOf(web.request, caseId)).airwayDeviceEntries?.map(entry => entry.status), { timeout: 30_000 }).toEqual(["failed", "in_use"])

    // The clinician who prefers the old tab gets it, with the device still ticked.
    await setScreen(web.request, "legacy")
    const legacy = await web.newPage()
    await webAirway(legacy, caseId)
    await expect(legacy.getByTestId("airway-smart")).toHaveCount(0)
    await expect(legacy.getByText("Oral ETT").first()).toBeVisible({ timeout: 30_000 })
  } finally {
    await setScreen(web.request, "smart")
    await web.close()
  }
})

test("Smart selection on the phone: a device added from the tab reaches the record", async ({ browser }) => {
  const web = await contextFor(browser, "member-a")
  try {
    await setScreen(web.request, "smart")
    const caseId = await startedCase(web.request)
    const phone = await openPhone(browser, E2E_MEMBER_A_EMAIL)
    await setScreen(web.request, "smart")
    await openPhoneIntraop(phone.page, caseId, "en")
    await phone.page.getByText("Airway", { exact: true }).first().click()
    await expect(phone.page.getByTestId("airway-smart")).toBeVisible({ timeout: 30_000 })
    await phone.page.getByTestId("airway-smart-more").click()
    await phone.page.getByTestId("airway-smart-card-LMA").click()
    await phone.page.getByTestId("airway-smart-add").click()
    await expect.poll(async () => (await intraopOf(web.request, caseId)).airwayDeviceEntries?.[0]?.device, { timeout: 30_000 }).toBe("LMA")
    const saved = await intraopOf(web.request, caseId)
    expect(saved.airwayDeviceEntries![0]).toMatchObject({ details: { lmaSize: 5 }, status: "in_use" })
    await phone.context.close()
  } finally {
    await web.close()
  }
})

test("charting Intubated on the timeline opens the same panel with that time already set", async ({ browser }) => {
  const web = await contextFor(browser, "member-a")
  try {
    await setScreen(web.request, "smart")
    const caseId = await startedCase(web.request)
    const page = await web.newPage()
    await page.goto(`/cases/new?continue=${caseId}&step=1`, { waitUntil: "domcontentloaded" })
    await page.getByRole("tab", { name: "Chart" }).or(page.getByRole("button", { name: "Chart", exact: true })).first().click({ timeout: 30_000 })
    // As a clinician would: a cell of the events row, then the event.
    await page.locator("[data-testid^='events-lane-col-']").nth(3).click({ timeout: 30_000 })
    // The selector is one quiet list (10.2.0): open the category, then the event.
    await page.getByTestId("event-category-Airway").click()
    await page.getByTestId("event-Intubated").click()
    await expect(page.getByTestId("airway-smart-panel")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId("airway-smart-time-timeline")).toBeVisible()
    // Added at once: the tube's save is queued behind the event's own, and must not clash with it.
    await page.getByTestId("airway-smart-add").click()

    // The tube went in at the time of the event on the chart.
    await expect.poll(async () => (await intraopOf(web.request, caseId)).airwayDeviceEntries?.length, { timeout: 30_000 }).toBe(1)
    const body = await (await web.request.get(`/api/cases/${caseId}`)).json() as { intraop?: { keyEvents?: { log?: Array<{ label?: string; ts: string }> } } }
    const event = body.intraop?.keyEvents?.log?.find(entry => entry.label === "Intubated")
    expect(event).toBeTruthy()
    expect((await intraopOf(web.request, caseId)).airwayDeviceEntries![0]!.insertedAt).toBe(event!.ts)
  } finally {
    await web.close()
  }
})
