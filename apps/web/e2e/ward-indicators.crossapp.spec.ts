import path from "path"
import { test, expect, type APIRequestContext } from "@playwright/test"
import { contextFor, EMAIL_FOR, JSON_HEADERS } from "./roles"
import { openPhone } from "./pwa"

/**
 * The unit indicators across both apps (10.0.0). Six cases with one procedure
 * name of their own are charted through the API — vitals, drugs, gas, fluids,
 * recovery — so the figures for that procedure are known exactly:
 *
 * - three of the six spend 15 minutes below MAP 65 (adult band);
 * - fentanyl 100 mcg in each: 10 mg IV morphine equivalent per case;
 * - sugammadex in four, one TIVA case (propofol infusion, no volatile);
 * - recovery pain above 3 in two, PONV in one, one hypothermic.
 *
 * INDICATOR_SHOTS_DIR, if set, keeps screenshots of the two screens.
 */
test.describe.configure({ timeout: 240_000 })

// A suffix in letters: a long number reads as an identifier and the API refuses it.
const PROCEDURE = `Indicators e2e ${Date.now().toString(36).replace(/[0-9]/g, "")}`
const SHOTS = process.env.INDICATOR_SHOTS_DIR

async function chartCase(request: APIRequestContext, index: number): Promise<string> {
  const startedAt = new Date(Date.now() - 90 * 60_000)
  startedAt.setUTCSeconds(0, 0)
  const at = (minutes: number) => new Date(startedAt.getTime() + minutes * 60_000).toISOString()
  const created = await request.post("/api/cases", {
    headers: JSON_HEADERS,
    data: {
      preop: {
        ageYears: 50, heightCm: 175, weightKg: 80, clinicalMode: "ADULT", asaScore: "II",
        // Apfel is worked out by the API: female, non-smoker and a history of PONV make 3.
        ...(index < 3 ? { sex: "FEMALE", smoking: false, apfelPONVHistory: true } : { sex: "MALE", smoking: true }),
        procedures: [{ label: PROCEDURE }], diagnoses: [{ label: "Cholelithiasis" }],
      },
      intraop: { startedAt: startedAt.toISOString(), timezone: "Europe/Sofia", techniques: ["GENERAL_BALANCED"] },
    },
  })
  expect(created.status(), await created.text()).toBe(201)
  const { id } = await created.json() as { id: string }
  const post = async (event: Record<string, unknown>) => {
    const response = await request.post(`/api/cases/${id}/events`, { headers: JSON_HEADERS, data: event })
    expect(response.ok(), `${event.type}: ${await response.text()}`).toBeTruthy()
  }
  for (let column = 0; column < 12; column += 1) {
    const low = index < 3 && column >= 2 && column <= 4
    await post({ id: `v-${id}-${column}`, type: "vital", ts: at(column * 5 + 1), systolic: low ? 90 : 120, diastolic: low ? 45 : 70, heartRate: 70, spO2: 98, temp: index === 0 && column === 6 ? 35.4 : 36.6 })
  }
  await post({ id: `d1-${id}`, type: "drug", ts: at(2), name: "Fentanyl", dose: "100", unit: "mcg", route: "IV" })
  await post({ id: `d2-${id}`, type: "drug", ts: at(3), name: "Rocuronium", dose: "50", unit: "mg", route: "IV" })
  if (index < 4) await post({ id: `d3-${id}`, type: "drug", ts: at(55), name: "Sugammadex", dose: "200", unit: "mg", route: "IV" })
  if (index < 2) {
    await post({ id: `d4-${id}`, type: "drug", ts: at(10), name: "Ondansetron", dose: "4", unit: "mg", route: "IV" })
    await post({ id: `d5-${id}`, type: "drug", ts: at(10), name: "Dexamethasone", dose: "4", unit: "mg", route: "IV" })
  }
  if (index < 5) {
    await post({ id: `g-${id}`, type: "gas_start", ts: at(1), fgf: 1, carrierGas: "air", fio2: 50 })
    await post({ id: `a-${id}`, type: "agent_start", ts: at(1), name: "Sevoflurane", value: "2", agentMode: "concurrent" })
  } else {
    await post({ id: `i-${id}`, type: "infusion_start", ts: at(1), infId: `p-${id}`, name: "Propofol", rate: "6", unit: "mg/kg/hr" })
  }
  await post({ id: `f-${id}`, type: "fluid_start", ts: at(1), fluidId: `fl-${id}`, name: "Ringer lactate", volume: 500, unit: "mL", category: "Crystalloids" })
  const ended = await request.patch(`/api/cases/${id}`, {
    headers: JSON_HEADERS,
    data: {
      intraop: { endedAt: at(60) },
      postop: {
        aldreteActivity: 2, aldreteRespiration: 2, aldreteCirculation: 2, aldreteConsciousness: 2, aldreteSpO2: 2,
        painScoreNRS: index < 2 ? 5 : 2, ponv: index === 0, disposition: "WARD",
      },
    },
  })
  expect(ended.ok(), await ended.text()).toBeTruthy()
  return id
}

test("the unit indicators count the department's cases on web and phone", async ({ browser }) => {
  const context = await contextFor(browser, "member-a")
  await context.addInitScript(() => { localStorage.setItem("tourCompleted", "1") })
  const ids: string[] = []
  try {
    for (let index = 0; index < 6; index += 1) ids.push(await chartCase(context.request, index))

    // ── The figures, from the API ──
    type Report = Record<string, Record<string, unknown>> & { cases: number }
    let body: { pending: number; report: Report } | null = null
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await context.request.get(`/api/indicators?procedure=${encodeURIComponent(PROCEDURE)}`)
      expect(response.ok(), await response.text()).toBeTruthy()
      body = await response.json()
      if (body!.pending === 0) break
    }
    const report = body!.report as unknown as {
      cases: number
      intraopEvents: { hypotension: { band: string; cases: number; withHypotension: { count: number; of: number }; minutes: { median: number } }[]; hypothermia: { count: number } }
      drugs: { morphineMg: { median: number }; sugammadex: { count: number }; tiva: { count: number }; volatile: { count: number }; ponvProphylaxisHighRisk: { count: number; of: number }; byClinician: { isMe: boolean; name: string | null }[] }
      recovery: { painAboveThreshold: { count: number; of: number }; ponv: { count: number } }
      environment: { kgCo2ePerCase: { median: number } }
    }
    expect(report.cases).toBe(6)
    const adult = report.intraopEvents.hypotension.find(row => row.band === "ADULT")!
    expect(adult).toMatchObject({ cases: 6, withHypotension: { count: 3, of: 6 } })
    expect(adult.minutes.median).toBe(7.5)
    expect(report.intraopEvents.hypothermia.count).toBe(1)
    expect(report.drugs.morphineMg.median).toBe(10)
    expect(report.drugs).toMatchObject({ sugammadex: { count: 4 }, tiva: { count: 1 }, volatile: { count: 5 } })
    // Of the three Apfel 3 cases, two had ondansetron and dexamethasone.
    expect(report.drugs.ponvProphylaxisHighRisk).toMatchObject({ count: null, of: 3 })
    expect(report.recovery).toMatchObject({ painAboveThreshold: { count: 2, of: 6 }, ponv: { count: 1 } })
    expect(report.drugs.byClinician.find(row => row.isMe)?.name).toBeTruthy()
    expect(report.environment.kgCo2ePerCase.median).toBeGreaterThan(0)

    // ── Web ──
    const page = await context.newPage()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.goto("/indicators", { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("indicators-cases")).toBeVisible({ timeout: 60_000 })
    await page.getByRole("combobox").filter({ hasText: /All procedures/ }).selectOption(PROCEDURE)
    await expect(page.getByTestId("indicators-cases")).toHaveText("6 cases", { timeout: 30_000 })
    await expect(page.getByTestId("indicators-hypotension")).toContainText("50 % (3/6)")
    await expect(page.getByTestId("indicators-clinicians")).toContainText("(You)")
    for (const section of ["activity", "time", "case-mix", "airway", "drugs", "environment", "fluids", "events", "recovery", "documentation"]) {
      await expect(page.getByTestId(`indicators-${section}`)).toBeVisible()
    }
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "web-indicators.png"), fullPage: true })

    // ── Phone ──
    const phone = await openPhone(browser, EMAIL_FOR["member-a"])
    try {
      await phone.page.goto("/", { waitUntil: "domcontentloaded" })
      await phone.page.getByTestId("open-indicators").click({ timeout: 60_000 })
      await expect(phone.page.getByTestId("indicators-cases")).toBeVisible({ timeout: 60_000 })
      await expect(phone.page.getByText("Hypotension: cases · median minutes")).toBeVisible()
      if (SHOTS) await phone.page.screenshot({ path: path.join(SHOTS, "phone-indicators.png"), fullPage: true })
    } finally {
      await phone.context.close()
    }
  } finally {
    for (const id of ids) await context.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS })
    await context.close()
  }
})
