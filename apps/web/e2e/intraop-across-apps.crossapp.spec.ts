import {
  test,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test"
import { contextFor, JSON_HEADERS } from "./roles"
import { E2E_MEMBER_A_EMAIL } from "./credentials"
import { openPhone, openPhoneIntraop, PWA_BASE } from "./pwa"

// 120s was tight even before the reload fixes below: each test drives two
// full apps and, since those fixes, does a real page reload + PWA bundle
// reinitialization mid-test rather than relying on live polling that doesn't
// exist on this route. 180s was still not enough on GitHub's shared CI
// runners, which run these two-app specs measurably slower than a local
// machine (~80-90s locally vs. hitting the ceiling in CI).
test.describe.configure({ timeout: 300_000 })

const STARTED_AT = "2026-08-23T05:55:00.000Z" // 08:55 in Europe/Sofia
const SYNTHETIC_END_NOW = new Date("2026-08-23T10:00:30+03:00")
const PREOP = {
  ageYears: 44,
  sex: "MALE" as const,
  heightCm: 180,
  weightKg: 82,
  clinicalMode: "ADULT",
  diagnoses: [{ label: "Cholelithiasis" }],
  procedures: [{ label: "Laparoscopic cholecystectomy" }],
  bpSystolic: 132,
  bpDiastolic: 78,
  heartRate: 72,
  respiratoryRate: 14,
  mallampati: "II" as const,
  asaScore: "II" as const,
}

type LogEvent = {
  id?: string
  ts?: string
  type?: string
  name?: string
  dose?: string | number
  unit?: string
  systolic?: number
  diastolic?: number
  sequence?: number
}

type CaseBody = {
  intraop?: {
    syncRevision?: number
    keyEvents?: { log?: LogEvent[] }
    crystalloidsMl?: number
    airwayDevices?: string[]
    oralTubeSize?: number
    oralCuffed?: boolean
    etco2Monitor?: boolean
    endedAt?: string
  }
  status?: string
}

const phoneHeaders = {
  Origin: PWA_BASE,
  "Content-Type": "application/json",
}

async function createStartedCase(context: BrowserContext): Promise<string> {
  const response = await context.request.post("/api/cases", {
    headers: JSON_HEADERS,
    data: {
      preop: PREOP,
      intraop: {
        monthYear: "2026-08",
        startTime: "08:55",
        startedAt: STARTED_AT,
        timezone: "Europe/Sofia",
        techniques: ["GENERAL_TIVA"],
        nbpMonitor: true,
        ecg: true,
        spO2Monitor: true,
      },
    },
  })
  expect(response.status(), await response.text()).toBe(201)
  const body = await response.json() as { id?: string }
  expect(body.id).toBeTruthy()
  return body.id!
}

async function caseBody(request: APIRequestContext, caseId: string): Promise<CaseBody> {
  const response = await request.get(`/api/cases/${caseId}`)
  expect(response.status(), await response.text()).toBe(200)
  return response.json() as Promise<CaseBody>
}

function logOf(body: CaseBody): LogEvent[] {
  return body.intraop?.keyEvents?.log ?? []
}

async function currentRevision(request: APIRequestContext, caseId: string): Promise<number> {
  const revision = (await caseBody(request, caseId)).intraop?.syncRevision
  expect(revision).toEqual(expect.any(Number))
  return revision!
}

/**
 * The revision after opening a real chart page has stopped moving.
 *
 * Opening the chart for a case that already has intraop content legitimately
 * re-saves it shortly after mount: IntraopForm's hydration-triggered autosave
 * (src/components/forms/IntraopForm.tsx) only skips the component's very
 * first paint — not the later render where the server's own data actually
 * lands in the form — so any real client opening this page bumps
 * syncRevision on its own, independent of anything this test does. That is
 * correct product behaviour, not something to work around by disabling it;
 * the test's job is to observe the settled state a real client would, not to
 * assume the revision it tracked before a real page was ever opened is still
 * current.
 *
 * Polls until two consecutive reads agree rather than assuming exactly one
 * autosave fires, so this holds whether the debounce lands zero, one, or (if
 * the debounce ever changes) more than one time.
 */
async function settledRevision(request: APIRequestContext, caseId: string): Promise<number> {
  let previous: number | null = null
  await expect(async () => {
    const current = await currentRevision(request, caseId)
    const stable = previous === current
    previous = current
    expect(stable, "revision is still moving").toBe(true)
  }).toPass({ timeout: 6_000, intervals: [300] })
  return previous!
}

async function auditSources(
  admin: APIRequestContext,
  caseId: string,
  action: "CASE_EVENT_ADD" | "CASE_EVENT_EDIT",
): Promise<string[]> {
  const response = await admin.get(`/api/admin/audit-logs?action=${action}`)
  expect(response.status(), await response.text()).toBe(200)
  const body = await response.json() as {
    logs?: { entityId?: string; detail?: { source?: string } }[]
  }
  return (body.logs ?? [])
    .filter(row => row.entityId === caseId)
    .map(row => row.detail?.source)
    .filter((value): value is string => typeof value === "string")
}

async function openWebChart(page: Page, caseId: string) {
  await page.addInitScript(() => window.localStorage.setItem("tourCompleted", "1"))
  await page.goto(`/cases/new?continue=${caseId}&step=1`, { waitUntil: "domcontentloaded" })
  const tab = page.getByRole("tab", { name: "Chart" })
  if (await tab.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false)) {
    await tab.click()
  }
  const chart = page.locator('[data-tour="intraop-timetable"]')
  await expect(chart).toBeVisible({ timeout: 60_000 })
  return chart
}

test("an offline PWA vital replays once, appears on Web, and keeps mobile provenance", async ({ browser }) => {
  const [web, admin] = await Promise.all([
    contextFor(browser, "member-a"),
    contextFor(browser, "admin"),
  ])
  const caseId = await createStartedCase(web)
  const { context: phoneContext, page: phone } = await openPhone(browser, E2E_MEMBER_A_EMAIL)

  try {
    await phone.clock.install({ time: SYNTHETIC_END_NOW })
    await openPhoneIntraop(phone, caseId)
    await phone.getByText("Timetable", { exact: true }).first().click()
    await phone.getByText("09:00", { exact: true }).first().click()

    const webPage = await web.newPage()
    await webPage.clock.install({ time: SYNTHETIC_END_NOW })
    const chart = await openWebChart(webPage, caseId)
    await expect(chart.locator('[title="123"]')).toHaveCount(0)

    await phoneContext.setOffline(true)
    await phone.getByText("Vitals", { exact: true }).first().click()
    await phone.getByPlaceholder("Sys").fill("123")
    await phone.getByPlaceholder("Dia").fill("77")
    await phone.getByText("Save vitals", { exact: true }).click()

    await expect(phone.getByText(/1 unsynced/i).first()).toBeVisible({ timeout: 20_000 })
    expect(logOf(await caseBody(web.request, caseId)).some(event =>
      event.type === "vital" && event.systolic === 123 && event.diastolic === 77,
    )).toBe(false)

    await phoneContext.setOffline(false)
    await expect.poll(async () => logOf(await caseBody(web.request, caseId)).filter(event =>
      event.type === "vital" && event.systolic === 123 && event.diastolic === 77,
    ).length, {
      timeout: 60_000,
      message: "the PWA vital did not replay exactly once",
    }).toBe(1)
    await expect(phone.getByText(/1 unsynced/i)).toHaveCount(0, { timeout: 30_000 })

    // The active edit-form route (/cases/new?continue=...) deliberately has
    // no LiveCaseUpdater -- only the read-only case summary route does, so a
    // clinician's in-progress typing there is never clobbered by a background
    // refresh. So the already-open desktop chart will not pick up the PWA
    // replay on its own; reload to see it, same as a real second reviewer
    // opening the chart after the fact would.
    await webPage.reload({ waitUntil: "domcontentloaded" })
    const reloadedChart = await openWebChart(webPage, caseId)
    await expect(reloadedChart.locator('[title="123"]').first()).toBeVisible({ timeout: 30_000 })
    await expect(reloadedChart.locator('[title="77"]').first()).toBeVisible()

    await expect.poll(() => auditSources(admin.request, caseId, "CASE_EVENT_ADD"), {
      timeout: 20_000,
    }).toContain("mobile")
  } finally {
    await phoneContext.setOffline(false).catch(() => {})
    await phoneContext.close()
    await web.request.delete(`/api/cases/${caseId}`, { headers: JSON_HEADERS }).catch(() => {})
    await web.close()
    await admin.close()
  }
})

test("Web and PWA alternate across an hour boundary with conflict, retry, correction, and projections", async ({ browser }) => {
  const [web, admin] = await Promise.all([
    contextFor(browser, "member-a"),
    contextFor(browser, "admin"),
  ])
  const caseId = await createStartedCase(web)
  const { context: phoneContext, page: phone } = await openPhone(browser, E2E_MEMBER_A_EMAIL)
  const drugId = `crossapp-drug-${caseId}`
  const vitalId = `crossapp-vital-${caseId}`
  const fluidId = `crossapp-fluid-${caseId}`
  const eventId = `crossapp-event-${caseId}`
  const checkpointId = `crossapp-checkpoint-${caseId}`
  let finalised = false

  try {
    let revision = await currentRevision(web.request, caseId)
    const webDrug = await web.request.post(`/api/cases/${caseId}/events`, {
      headers: {
        ...JSON_HEADERS,
        "x-lospor-intraop-revision": String(revision),
        // This is deliberately false. The server must ignore it and use the
        // signed Web session, otherwise any browser could forge provenance.
        "x-lospor-source": "ai",
      },
      data: {
        id: drugId,
        type: "drug",
        ts: "2026-08-23T05:59:59.000Z",
        name: "Propofol",
        dose: "50",
        unit: "mg",
      },
    })
    expect(webDrug.status(), await webDrug.text()).toBe(200)
    revision = (await webDrug.json() as { intraopRevision: number }).intraopRevision

    const stalePhoneVital = await phoneContext.request.post(`/v1/cases/${caseId}/events`, {
      headers: {
        ...phoneHeaders,
        "x-lospor-intraop-revision": String(revision - 1),
        "x-lospor-source": "import",
      },
      data: {
        id: vitalId,
        type: "vital",
        ts: "2026-08-23T06:00:00.000Z",
        systolic: 121,
        diastolic: 76,
        heartRate: 68,
        spO2: 99,
      },
    })
    expect(stalePhoneVital.status()).toBe(409)
    await expect(stalePhoneVital.json()).resolves.toMatchObject({
      error: "conflict",
      section: "intraop",
      serverVersion: { revision },
    })

    const phoneVital = await phoneContext.request.post(`/v1/cases/${caseId}/events`, {
      headers: {
        ...phoneHeaders,
        "x-lospor-intraop-revision": String(revision),
        "x-lospor-source": "import",
      },
      data: {
        id: vitalId,
        type: "vital",
        ts: "2026-08-23T06:00:00.000Z",
        systolic: 121,
        diastolic: 76,
        heartRate: 68,
        spO2: 99,
      },
    })
    expect(phoneVital.status(), await phoneVital.text()).toBe(200)
    revision = (await phoneVital.json() as { intraopRevision: number }).intraopRevision

    const webPage = await web.newPage()
    await webPage.clock.install({ time: SYNTHETIC_END_NOW })
    const liveChart = await openWebChart(webPage, caseId)
    await expect(liveChart.locator('[title="121"]').first()).toBeVisible()

    // The chart page just legitimately re-saved on its own (see
    // settledRevision's doc comment) — fetch the revision that actually
    // resulted, the way a real second client would, rather than reusing what
    // this test tracked from before that page existed.
    revision = await settledRevision(web.request, caseId)

    const correctedDrug = await web.request.put(`/api/cases/${caseId}/events/${drugId}`, {
      headers: {
        ...JSON_HEADERS,
        "x-lospor-intraop-revision": String(revision),
      },
      data: {
        type: "drug",
        ts: "2026-08-23T05:59:59.000Z",
        name: "Propofol",
        dose: "60",
        unit: "mg",
      },
    })
    expect(correctedDrug.status(), await correctedDrug.text()).toBe(200)
    revision = (await correctedDrug.json() as { intraopRevision: number }).intraopRevision

    const phoneFluid = await phoneContext.request.post(`/v1/cases/${caseId}/events`, {
      headers: {
        ...phoneHeaders,
        "x-lospor-intraop-revision": String(revision),
      },
      data: {
        id: fluidId,
        type: "fluid_start",
        ts: "2026-08-23T06:00:01.000Z",
        fluidId,
        name: "Ringer lactate",
        volume: 500,
        unit: "mL",
        // The three category strings calculateFluidTotals recognises are
        // exact literals ("Crystalloids" | "Colloids" | "Blood products",
        // see lospor-core/src/intraop-totals.ts) — anything else is silently
        // excluded from the total rather than rejected.
        category: "Crystalloids",
      },
    })
    expect(phoneFluid.status(), await phoneFluid.text()).toBe(200)
    revision = (await phoneFluid.json() as { intraopRevision: number }).intraopRevision

    const deviceAndMonitoring = await phoneContext.request.patch(`/v1/cases/${caseId}`, {
      headers: {
        ...phoneHeaders,
        "x-lospor-intraop-revision": String(revision),
      },
      data: {
        intraop: {
          airwayDevices: ["ORAL_ETT"],
          oralTubeSize: 7.5,
          oralCuffed: true,
          ecg: true,
          spO2Monitor: true,
          nbpMonitor: true,
          etco2Monitor: true,
        },
      },
    })
    expect(deviceAndMonitoring.status(), await deviceAndMonitoring.text()).toBe(200)
    revision = (await deviceAndMonitoring.json() as { intraopRevision: number }).intraopRevision

    const clinicalEvent = await web.request.post(`/api/cases/${caseId}/events`, {
      headers: {
        ...JSON_HEADERS,
        "x-lospor-intraop-revision": String(revision),
      },
      data: {
        id: eventId,
        type: "clinical_event",
        ts: "2026-08-23T06:30:30.000Z",
        label: "Position checked",
      },
    })
    expect(clinicalEvent.status(), await clinicalEvent.text()).toBe(200)
    revision = (await clinicalEvent.json() as { intraopRevision: number }).intraopRevision

    // Advance a complete synthetic hour in five-minute observations. Requests
    // alternate between the desktop Web cookie and the PWA cookie, while the
    // browser clocks stay fixed just beyond the final point so minute/hour
    // rollover renders deterministically instead of waiting for wall time.
    const hourVitalIds: string[] = []
    for (let minute = 5; minute <= 55; minute += 5) {
      const id = `crossapp-hour-vital-${minute}-${caseId}`
      hourVitalIds.push(id)
      const fromPhone = minute % 10 === 0
      const response = await (fromPhone ? phoneContext.request : web.request).post(
        `${fromPhone ? "/v1" : "/api"}/cases/${caseId}/events`,
        {
          headers: {
            ...(fromPhone ? phoneHeaders : JSON_HEADERS),
            "x-lospor-intraop-revision": String(revision),
          },
          data: {
            id,
            type: "vital",
            ts: `2026-08-23T06:${String(minute).padStart(2, "0")}:00.000Z`,
            systolic: 120 + minute,
            diastolic: 70 + Math.floor(minute / 5),
            heartRate: 65 + Math.floor(minute / 5),
            spO2: 99,
          },
        },
      )
      expect(response.status(), await response.text()).toBe(200)
      revision = (await response.json() as { intraopRevision: number }).intraopRevision
    }

    const checkpoint = await phoneContext.request.post(`/v1/cases/${caseId}/events`, {
      headers: {
        ...phoneHeaders,
        "x-lospor-intraop-revision": String(revision),
      },
      data: {
        id: checkpointId,
        type: "clinical_event",
        ts: "2026-08-23T06:59:59.000Z",
        label: "One-hour checkpoint",
      },
    })
    expect(checkpoint.status(), await checkpoint.text()).toBe(200)
    revision = (await checkpoint.json() as { intraopRevision: number }).intraopRevision

    const stored = await caseBody(web.request, caseId)
    const log = logOf(stored)
    expect(log.map(event => event.id)).toEqual([
      drugId,
      vitalId,
      fluidId,
      ...hourVitalIds.slice(0, 6),
      eventId,
      ...hourVitalIds.slice(6),
      checkpointId,
    ])
    expect(log.find(event => event.id === drugId)).toMatchObject({ dose: "60", sequence: 2 })
    expect(stored.intraop?.crystalloidsMl).toBe(500)
    expect(stored.intraop).toMatchObject({
      airwayDevices: ["ORAL_ETT"],
      oralTubeSize: 7.5,
      oralCuffed: true,
      etco2Monitor: true,
    })
    expect(Date.parse(log.at(-1)!.ts!) - Date.parse(log[0]!.ts!)).toBe(60 * 60 * 1_000)

    // The desktop chart was opened before the PWA wrote the remainder of the
    // hour, and this route (the active edit form) has no background poll for
    // another client's writes — deliberately: silently rewriting the chart
    // under a clinician's cursor while they are mid-entry would risk losing
    // whatever they are typing. LiveCaseUpdater's live refresh is wired into
    // the read-only case summary (src/app/(app)/cases/[id]/page.tsx), not
    // this one. A real second clinician sees a colleague's update on this
    // screen by reloading it, same as here.
    await webPage.reload({ waitUntil: "domcontentloaded" })
    const reloadedChart = await openWebChart(webPage, caseId)
    await expect(reloadedChart.locator('[title="175"]').first()).toBeVisible({ timeout: 30_000 })

    // The reload just mounted the form again, which re-triggers the same
    // hydration-autosave settledRevision documents above. Re-settle before
    // any later request trusts `revision`.
    revision = await settledRevision(web.request, caseId)

    await expect.poll(() => auditSources(admin.request, caseId, "CASE_EVENT_ADD"), {
      timeout: 20_000,
    }).toEqual(expect.arrayContaining(["web", "mobile"]))
    await expect.poll(() => auditSources(admin.request, caseId, "CASE_EVENT_EDIT"), {
      timeout: 20_000,
    }).toContain("web")

    await phone.clock.install({ time: SYNTHETIC_END_NOW })
    await openPhoneIntraop(phone, caseId)
    await phone.getByText("Event log", { exact: true }).first().click()
    await expect(phone.getByText(/Propofol.*60.*mg/i).first()).toBeVisible()
    await expect(phone.getByText(/121\/76/).first()).toBeVisible()
    await expect(phone.getByText("Position checked", { exact: true }).first()).toBeVisible()
    await expect(phone.getByText("One-hour checkpoint", { exact: true }).first()).toBeVisible()

    const printData = await web.request.get(`/api/cases/${caseId}/print-data`)
    expect(printData.status(), await printData.text()).toBe(200)
    const printable = await printData.json() as CaseBody
    expect(logOf(printable).find(event => event.id === drugId)).toMatchObject({ dose: "60" })
    expect(logOf(printable).at(-1)).toMatchObject({ id: checkpointId })
    expect(printable.intraop).toMatchObject({
      crystalloidsMl: 500,
      airwayDevices: ["ORAL_ETT"],
      etco2Monitor: true,
    })

    // The reloaded chart is still mounted, and a good deal of real time has
    // passed since it last settled — the polls above alone can run up to 40s.
    // Settling once right after the reload isn't enough for a page that
    // stays open this long; settle again immediately before the write that
    // actually depends on it.
    revision = await settledRevision(web.request, caseId)

    const completeSections = await web.request.patch(`/api/cases/${caseId}`, {
      headers: {
        ...JSON_HEADERS,
        "x-lospor-intraop-revision": String(revision),
      },
      data: {
        intraop: {
          endTime: "10:05",
          endedAt: "2026-08-23T07:05:00.000Z",
        },
        postop: {
          aldreteActivity: 2,
          aldreteRespiration: 2,
          aldreteCirculation: 2,
          aldreteConsciousness: 2,
          aldreteSpO2: 2,
          disposition: "PACU",
        },
      },
    })
    expect(completeSections.status(), await completeSections.text()).toBe(200)

    const finalization = await phoneContext.request.post(`/v1/cases/${caseId}/finalize`, {
      headers: phoneHeaders,
    })
    expect(finalization.status(), await finalization.text()).toBe(200)
    await expect(finalization.json()).resolves.toMatchObject({ id: caseId, status: "COMPLETE" })
    finalised = true
    await expect.poll(async () => (await caseBody(web.request, caseId)).status).toBe("COMPLETE")
  } finally {
    await phoneContext.close()
    if (finalised) {
      await web.request.post(`/api/cases/${caseId}/unfinalize`, { headers: JSON_HEADERS }).catch(() => {})
    }
    await web.request.delete(`/api/cases/${caseId}`, { headers: JSON_HEADERS }).catch(() => {})
    await web.close()
    await admin.close()
  }
})
