import path from "path"
import { mkdirSync } from "fs"
import { test, expect, type APIRequestContext, type Page } from "@playwright/test"
import { contextFor, JSON_HEADERS } from "./roles"
import { E2E_MEMBER_A_EMAIL } from "./credentials"
import { openPhone, openPhoneIntraop } from "./pwa"
import { withIntraopAutomation } from "./automation-setup"

/**
 * The intraoperative lists and sheets as they look now, on the web and the
 * phone, for reviewing and for the user guide. Not a test of behaviour: it
 * runs only with LIST_SHOTS_DIR set and writes <dir>/<web|phone>/<name>.png.
 * A screen that cannot be reached is reported and skipped.
 */
const DIR = process.env.LIST_SHOTS_DIR
test.skip(!DIR, "LIST_SHOTS_DIR not set")
test.describe.configure({ timeout: 1_800_000 })

const AUTOMATION = {
  enabled: true,
  vitalQuestions: { enabled: true },
  groups: { treatmentSuggestions: true, reverseQuestions: true, readingQuestions: true, labQuestions: true, reminders: true, timers: true },
  dantroleneVialsMg: [20, 250],
}

const PREOP = {
  ageYears: 45, sex: "MALE" as const, heightCm: 182, weightKg: 82, clinicalMode: "ADULT",
  diagnoses: [{ label: "Cholelithiasis" }], procedures: [{ label: "Laparoscopic cholecystectomy" }],
  bpSystolic: 132, bpDiastolic: 78, heartRate: 72, respiratoryRate: 14, mallampati: "II" as const, asaScore: "II" as const,
}
const at = (minutesAgo: number) => new Date(Math.floor((Date.now() - minutesAgo * 60_000) / 300_000) * 300_000).toISOString()

function outDir(kind: "web" | "phone") {
  const dir = path.join(DIR!, kind)
  mkdirSync(dir, { recursive: true })
  return dir
}

async function shot(page: Page, kind: "web" | "phone", name: string, fullPage = false) {
  await expect(page.getByText("Loading draft…", { exact: true })).toHaveCount(0, { timeout: 30_000 })
  await page.waitForTimeout(900)
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {})
  await page.screenshot({ path: path.join(outDir(kind), `${name}.png`), fullPage })
}

async function step(label: string, run: () => Promise<void>) {
  try { await run() } catch (error) { console.log(`[lists] skipped ${label}: ${(error as Error).message.split("\n")[0]}`) }
}

/** Activate a web section in any of the account's three supported layouts. */
async function openWebSection(page: Page, id: string, label: string) {
  const tab = page.getByRole("tab", { name: label, exact: true }).first()
  if (await tab.isVisible().catch(() => false)) {
    await tab.click()
    return
  }
  const button = page.getByRole("button", { name: label, exact: true }).first()
  if (await button.isVisible().catch(() => false)) {
    await button.click()
    return
  }
  // Scroll/sidebar layouts do not expose a tab for the section. Their anchors
  // are the shared contract used by the sidebar and the jump strip.
  await page.locator(`#intraop-sec-${id}`).scrollIntoViewIfNeeded()
}

async function startedCase(request: APIRequestContext): Promise<string> {
  const created = await request.post("/api/cases", {
    headers: JSON_HEADERS,
    data: {
      preop: PREOP,
      intraop: {
        startedAt: at(75), timezone: "Europe/Sofia", techniques: ["GENERAL_TIVA"], nbpMonitor: true, ecg: true, spO2Monitor: true,
        airwayDeviceEntries: [{ id: "a1", kind: "ETT", size: "8.0", cuffed: true, status: "in_use", at: at(70) }],
      },
    },
  })
  return (await created.json() as { id: string }).id
}

async function seedChart(request: APIRequestContext, caseId: string) {
  const events = [
    { id: "d1", type: "drug", ts: at(70), name: "Propofol", dose: "150", unit: "mg", drugRoute: "IV" },
    { id: "d2", type: "drug", ts: at(68), name: "Fentanyl", dose: "100", unit: "mcg", drugRoute: "IV" },
    { id: "d3", type: "drug", ts: at(66), name: "Rocuronium", dose: "50", unit: "mg", drugRoute: "IV" },
    { id: "v1", type: "vital", ts: at(60), systolic: 118, diastolic: 70, heartRate: 66, spO2: 99 },
    { id: "v2", type: "vital", ts: at(30), systolic: 92, diastolic: 54, heartRate: 70, spO2: 98 },
    { id: "c1", type: "complication", ts: at(10), label: "Hypotension", color: "#ef4444", complicationSource: "timeline" },
  ]
  for (const event of events) await request.post(`/api/cases/${caseId}/events`, { headers: JSON_HEADERS, data: event })
}

test("the intraoperative lists on the web", async ({ browser }) => {
  const web = await contextFor(browser, "member-a")
  await web.request.patch("/api/user", { headers: JSON_HEADERS, data: { preferences: { ui: { locale: "en" } } } })
  const automation = await withIntraopAutomation(AUTOMATION)
  try {
    const caseId = await startedCase(web.request)
    await seedChart(web.request, caseId)
    const page = await web.newPage()
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/cases/new?continue=${caseId}&step=1`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(3000)
    await shot(page, "web", "00-landing")
    for (const [name, id, label] of [["01-overview", "overview", "Overview"], ["02-anaesthesia", "anaesthesia", "Anaesthesia"], ["03-chart", "chart", "Chart"], ["04-finish", "finish", "Finish"]] as const) {
      await step(`web tab ${label}`, async () => {
        await openWebSection(page, id, label)
        await shot(page, "web", name, true)
      })
    }
    await step("web card", async () => {
      await openWebSection(page, "chart", "Chart")
      await page.getByTestId("attention-open-card:c1").click({ timeout: 20_000 })
      await shot(page, "web", "10-card")
      await page.getByTestId("card-row-ephedrine").locator("button").first().click({ timeout: 8000 })
      await shot(page, "web", "11-card-inline-dose")
    })
  } finally {
    await automation.restore()
    await web.close()
  }
})

const PHONE_TABS = [
  ["timing", "Timing", true],
  ["equipment", "Equipment", false],
  ["technique", "Technique", true],
  ["position", "Position", false],
  ["monitoring", "Monitoring", false],
  ["airway", "Airway", false],
  ["vascular", "Vascular", false],
  ["premedication", "Premedication", false],
  ["log", "Timetable", false],
  ["fluids", "Fluid status", false],
  ["events", "Event log", false],
] as const

test("the intraoperative lists on the phone", async ({ browser }) => {
  const web = await contextFor(browser, "member-a")
  const automation = await withIntraopAutomation(AUTOMATION)
  try {
    const caseId = await startedCase(web.request)
    await seedChart(web.request, caseId)
    const phone = await openPhone(browser, E2E_MEMBER_A_EMAIL)
    await web.request.patch("/api/user", { headers: JSON_HEADERS, data: { preferences: { ui: { locale: "en" } } } })
    await openPhoneIntraop(phone.page, caseId, "en")
    await shot(phone.page, "phone", "00-landing")
    let index = 1
    for (const [slug, label, required] of PHONE_TABS) {
      const number = String(index++).padStart(2, "0")
      await step(`phone tab ${label}`, async () => {
        const pattern = required ? new RegExp(`^${label}\\s*\\*?$`) : label
        await phone.page.getByText(pattern, { exact: required }).first().click({ timeout: 8000 })
        await shot(phone.page, "phone", `${number}-tab-${slug}`)
      })
    }
    await step("phone card", async () => {
      await phone.page.getByText("Timetable", { exact: true }).first().click({ timeout: 8000 })
      await phone.page.getByTestId("attention-suggestion-open-card:c1").click({ timeout: 20_000 })
      await shot(phone.page, "phone", "20-card")
      await phone.page.getByTestId("card-row-open-ephedrine").click({ timeout: 8000 })
      await shot(phone.page, "phone", "21-card-inline-dose")
    })
    await phone.context.close()
  } finally {
    await automation.restore()
    await web.close()
  }
})
