import path from "path"
import { mkdirSync } from "fs"
import { test, expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test"
import { contextFor, EMAIL_FOR, JSON_HEADERS } from "./roles"
import { openPhone } from "./pwa"
import { renameInstitutionOf, widenResearchGrants, withTheatres } from "./theatres-setup"
import { E2E_PASSWORD } from "./credentials"
import enMessages from "../messages/en.json"
import bgMessages from "../messages/bg.json"

/**
 * The screens of the LOSPOR User Guide (lospor-user-guide), in Bulgarian and
 * English, on the web and the phone, over a small demo department seeded for
 * the purpose and removed afterwards. Not a test of behaviour: it runs only
 * with GUIDE_SHOTS_DIR set, and writes <dir>/<locale>/<name>.png. A screen that
 * cannot be reached is reported and skipped, so one change does not lose the
 * rest.
 */
const DIR = process.env.GUIDE_SHOTS_DIR
test.skip(!DIR, "GUIDE_SHOTS_DIR not set")
test.describe.configure({ timeout: 1_800_000 })

type Locale = "bg" | "en"
const MESSAGES = { bg: bgMessages, en: enMessages }
const LOCALES: Locale[] = (process.env.GUIDE_LOCALES?.split(",") as Locale[] | undefined) ?? ["bg", "en"]

// What the demo department is called and writes, in each language. Fictional people.
const TEXT = {
  bg: {
    clinician: { title: "д-р", firstName: "Мария", lastName: "Петрова" },
    head: { title: "д-р", firstName: "Георги", lastName: "Иванов" },
    theatres: ["Операционна зала 1", "Операционна зала 2"] as [string, string],
    hospital: "УМБАЛ „Демо“",
    chole: ["Лапароскопска холецистектомия", "Холелитиаза"],
    hernia: ["Херниопластика", "Ингвинална херния"],
    appendix: ["Лапароскопска апендектомия", "Остър апендицит"],
    knee: ["Тотално ендопротезиране на колянна става", "Гонартроза"],
    colon: ["Дясна хемиколектомия", "Карцином на възходящото дебело черво"],
    unknown: "Остър корем",
    tonsils: ["Тонзилектомия", "Хроничен тонзилит"],
    cancelNote: "",
  },
  en: {
    clinician: { title: "Dr", firstName: "Maria", lastName: "Petrova" },
    head: { title: "Dr", firstName: "Georgi", lastName: "Ivanov" },
    theatres: ["Operating theatre 1", "Operating theatre 2"] as [string, string],
    hospital: "Demo University Hospital",
    chole: ["Laparoscopic cholecystectomy", "Cholelithiasis"],
    hernia: ["Inguinal hernia repair", "Inguinal hernia"],
    appendix: ["Laparoscopic appendectomy", "Acute appendicitis"],
    knee: ["Total knee arthroplasty", "Gonarthrosis"],
    colon: ["Right hemicolectomy", "Carcinoma of the ascending colon"],
    unknown: "Acute abdomen",
    tonsils: ["Tonsillectomy", "Chronic tonsillitis"],
    cancelNote: "",
  },
}

const WEB = { width: 1440, height: 900 }

function outDir(locale: Locale) {
  const dir = path.join(DIR!, locale)
  mkdirSync(dir, { recursive: true })
  return dir
}

async function shot(page: Page, locale: Locale, name: string, options: { fullPage?: boolean; wait?: number } = {}) {
  await page.waitForTimeout(options.wait ?? 1200)
  // The dev server's badge is not part of LOSPOR.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {})
  await page.screenshot({ path: path.join(outDir(locale), `${name}.png`), fullPage: options.fullPage ?? false })
}

async function step(label: string, run: () => Promise<void>) {
  try { await run() } catch (error) { console.log(`[guide] skipped ${label}: ${(error as Error).message.split("\n")[0]}`) }
}

async function lightTheme(context: BrowserContext) {
  // A missing element skips its screenshot rather than hanging the whole run.
  context.setDefaultTimeout(30_000)
  await context.addCookies([{ name: "theme", value: "light", url: "http://localhost:3000" }])
  await context.addInitScript(() => {
    localStorage.setItem("theme", "light")
    localStorage.setItem("tourCompleted", "1")
    localStorage.setItem("lospor_ss_lospor_theme", "light")
  })
}

async function speak(request: APIRequestContext, locale: Locale, person: { title: string; firstName: string; lastName: string }) {
  const response = await request.patch("/api/user", { headers: JSON_HEADERS, data: { ...person, preferences: { ui: { locale } } } })
  expect(response.ok(), await response.text()).toBeTruthy()
}

type Seeded = { ids: string[]; codes: Record<string, { id: string; code: string }> }

/** One charted, finished case: the unit indicators read these. */
async function finishedCase(request: APIRequestContext, index: number, labels: string[], daysAgo: number, theatreId: string): Promise<string> {
  const startedAt = new Date(Date.now() - daysAgo * 86_400_000 - (3 + index % 3) * 3600_000)
  startedAt.setUTCMinutes(index * 5 % 60, 0, 0)
  const at = (minutes: number) => new Date(startedAt.getTime() + minutes * 60_000).toISOString()
  const female = index % 3 === 0
  const created = await request.post("/api/cases", {
    headers: JSON_HEADERS,
    data: {
      patientNumber: `USER-GUIDE-E2E-${index}-${Date.now()}`,
      preop: {
        ageYears: 38 + index * 4, heightCm: female ? 164 : 178, weightKg: female ? 66 : 84, clinicalMode: "ADULT", asaScore: index % 4 === 0 ? "III" : "II",
        ...(female ? { sex: "FEMALE", smoking: false, apfelPONVHistory: index % 2 === 0 } : { sex: "MALE", smoking: index % 2 === 0 }),
        procedures: [{ label: labels[0] }], diagnoses: [{ label: labels[1] }],
        bpSystolic: 128, bpDiastolic: 78, heartRate: 72, respiratoryRate: 14, spO2: 97, mallampati: "II",
      },
    },
  })
  expect(created.status(), await created.text()).toBe(201)
  const { id } = await created.json() as { id: string }
  // The theatre is given before the start: from then it is fixed.
  await request.post(`/api/cases/${id}/theatre`, { headers: JSON_HEADERS, data: { theatreId, expectedTheatreId: null } })
  const started = await request.patch(`/api/cases/${id}`, { headers: JSON_HEADERS, data: { intraop: { startedAt: startedAt.toISOString(), timezone: "Europe/Sofia", techniques: ["GENERAL_BALANCED"] } } })
  expect(started.ok(), await started.text()).toBeTruthy()
  const post = async (event: Record<string, unknown>) => {
    const response = await request.post(`/api/cases/${id}/events`, { headers: JSON_HEADERS, data: event })
    expect(response.ok(), `${event.type}: ${await response.text()}`).toBeTruthy()
  }
  for (let column = 0; column < 14; column += 1) {
    const low = index % 3 === 0 && column >= 2 && column <= 3
    await post({ id: `v-${id}-${column}`, type: "vital", ts: at(column * 5 + 1), systolic: low ? 88 : 118 + (column % 3) * 4, diastolic: low ? 46 : 70, heartRate: 68 + (column % 4), spO2: 98, etco2: 36, temp: 36.4 })
  }
  await post({ id: `d1-${id}`, type: "drug", ts: at(2), name: "Propofol", dose: "150", unit: "mg", route: "IV" })
  await post({ id: `d2-${id}`, type: "drug", ts: at(2), name: "Fentanyl", dose: "100", unit: "mcg", route: "IV" })
  await post({ id: `d3-${id}`, type: "drug", ts: at(3), name: "Rocuronium", dose: "50", unit: "mg", route: "IV" })
  if (index % 2 === 0) await post({ id: `d4-${id}`, type: "drug", ts: at(60), name: "Sugammadex", dose: "200", unit: "mg", route: "IV" })
  await post({ id: `d5-${id}`, type: "drug", ts: at(15), name: "Ondansetron", dose: "4", unit: "mg", route: "IV" })
  await post({ id: `g-${id}`, type: "gas_start", ts: at(1), fgf: 1, carrierGas: "air", fio2: 50 })
  await post({ id: `a-${id}`, type: "agent_start", ts: at(4), name: "Sevoflurane", value: "2", agentMode: "concurrent" })
  await post({ id: `f-${id}`, type: "fluid_start", ts: at(1), fluidId: `fl-${id}`, name: "Ringer lactate", volume: 500, unit: "mL", category: "Crystalloids" })
  const ended = await request.patch(`/api/cases/${id}`, {
    headers: JSON_HEADERS,
    data: {
      intraop: { endedAt: at(70) },
      postop: {
        aldreteActivity: 2, aldreteRespiration: 2, aldreteCirculation: 2, aldreteConsciousness: 2, aldreteSpO2: index % 5 === 0 ? 1 : 2,
        recoveryBpSystolic: 124, recoveryBpDiastolic: 74, recoveryHeartRate: 76, recoverySpO2: 96, temperatureCelsius: 36.5,
        painScoreNRS: index % 4 === 0 ? 5 : 2, ponv: index === 1, disposition: "WARD",
      },
    },
  })
  expect(ended.ok(), await ended.text()).toBeTruthy()
  const finalized = await request.post(`/api/cases/${id}/finalize`, { headers: JSON_HEADERS, data: {} })
  if (!finalized.ok()) console.log(`[guide] case ${index} not finalised: ${await finalized.text()}`)
  return id
}

async function seed(request: APIRequestContext, locale: Locale, theatres: { id: string }[]): Promise<Seeded> {
  const t = TEXT[locale]
  const ids: string[] = []
  const codes: Seeded["codes"] = {}
  const keep = async (key: string, id: string) => {
    ids.push(id)
    const record = await (await request.get(`/api/cases/${id}`)).json() as { caseCode: string }
    codes[key] = { id, code: record.caseCode }
  }
  // Twelve finished, six this week and six last, for the indicators and the list.
  for (let index = 0; index < 12; index += 1) {
    const daysAgo = index < 6 ? Math.floor(index / 3) : 7 + Math.floor((index - 6) / 2)
    ids.push(await finishedCase(request, index, index % 2 === 0 ? t.chole : t.hernia, daysAgo, theatres[index % 2].id))
  }
  await keep("finished", ids[0])

  const create = async (data: Record<string, unknown>) => {
    const created = await request.post("/api/cases", { headers: JSON_HEADERS, data: { patientNumber: `USER-GUIDE-SEED-E2E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...data } })
    expect(created.status(), await created.text()).toBe(201)
    return (await created.json() as { id: string }).id
  }
  const fullPreop = (labels: string[], extra: Record<string, unknown> = {}) => ({
    ageYears: 54, sex: "FEMALE", heightCm: 166, weightKg: 71, clinicalMode: "ADULT", asaScore: "II",
    procedures: [{ label: labels[0] }], diagnoses: [{ label: labels[1] }],
    bpSystolic: 134, bpDiastolic: 82, heartRate: 76, respiratoryRate: 15, spO2: 97, mallampati: "II", smoking: false, ...extra,
  })

  // Awaiting allocation, in theatre 1.
  const allocation = await create({ preop: fullPreop(t.appendix, { ageYears: 29, sex: "MALE", heightCm: 181, weightKg: 79 }) })
  await request.post(`/api/cases/${allocation}/theatre`, { headers: JSON_HEADERS, data: { theatreId: theatres[0].id, expectedTheatreId: null } })
  await keep("allocation", allocation)

  // In theatre, charted for the last 45 minutes.
  const startedAt = new Date(Date.now() - 45 * 60_000)
  const zone = "Europe/Sofia"
  const inTheatre = await create({
    preop: fullPreop(t.knee, { ageYears: 68, heightCm: 162, weightKg: 82, asaScore: "III", allergies: true, allergyDetails: [{ label: "Penicillin" }] }),
    intraop: { startedAt: startedAt.toISOString(), timezone: zone, techniques: ["GENERAL_BALANCED"] },
  })
  await request.post(`/api/cases/${inTheatre}/theatre`, { headers: JSON_HEADERS, data: { theatreId: theatres[1].id, expectedTheatreId: null } }).catch(() => {})
  const at = (minutes: number) => new Date(startedAt.getTime() + minutes * 60_000).toISOString()
  const event = (body: Record<string, unknown>) => request.post(`/api/cases/${inTheatre}/events`, { headers: JSON_HEADERS, data: body })
  for (let column = 0; column < 9; column += 1) {
    await event({ id: `v-${inTheatre}-${column}`, type: "vital", ts: at(column * 5 + 1), systolic: 132 - column * 2, diastolic: 76, heartRate: 70 + column, spO2: 99, etco2: 35, temp: 36.3 })
  }
  for (const body of [
    { type: "drug", ts: at(2), name: "Midazolam", dose: "2", unit: "mg", route: "IV" },
    { type: "drug", ts: at(4), name: "Propofol", dose: "140", unit: "mg", route: "IV" },
    { type: "drug", ts: at(4), name: "Fentanyl", dose: "150", unit: "mcg", route: "IV" },
    { type: "drug", ts: at(5), name: "Rocuronium", dose: "50", unit: "mg", route: "IV" },
    { type: "drug", ts: at(20), name: "Cefazolin", dose: "2", unit: "g", route: "IV" },
    { type: "infusion_start", ts: at(6), infId: "inf-remi", name: "Remifentanil", rate: "0.1", unit: "mcg/kg/min" },
    { type: "gas_start", ts: at(5), fgf: 1, carrierGas: "air", fio2: 50 },
    { type: "agent_start", ts: at(6), name: "Sevoflurane", value: "1.8", agentMode: "concurrent" },
    { type: "fluid_start", ts: at(3), fluidId: "fl-ringer", name: "Ringer lactate", volume: 1000, unit: "mL", category: "Crystalloids" },
    { type: "clinical_event", ts: at(15), label: "Incision" },
  ]) await event(body)
  await keep("inTheatre", inTheatre)

  // Finished in theatre, waiting for its postop.
  const awaitingStart = new Date(Date.now() - 150 * 60_000)
  const awaiting = await create({
    preop: fullPreop(t.colon, { ageYears: 71, sex: "MALE", heightCm: 174, weightKg: 77, asaScore: "III" }),
    intraop: { startedAt: awaitingStart.toISOString(), timezone: zone, techniques: ["GENERAL_BALANCED", "EPIDURAL"] },
  })
  const ending = await request.patch(`/api/cases/${awaiting}`, { headers: JSON_HEADERS, data: { intraop: { endedAt: new Date(awaitingStart.getTime() + 140 * 60_000).toISOString() } } })
  expect(ending.ok(), await ending.text()).toBeTruthy()
  const recovery = await request.patch(`/api/cases/${awaiting}`, { headers: JSON_HEADERS, data: { postop: { recoveryBpSystolic: 118, recoverySpO2: 91 } } })
  if (!recovery.ok()) console.log(`[guide] postop start: ${await recovery.text()}`)
  await keep("awaitingPostop", awaiting)

  // Cancelled before anaesthesia.
  const cancelled = await create({ preop: fullPreop(t.hernia, { ageYears: 47, sex: "MALE" }) })
  await request.post(`/api/cases/${cancelled}/cancel`, { headers: JSON_HEADERS, data: { reason: "PATIENT_CONDITION" } })
  await keep("cancelled", cancelled)

  // Planned as not yet known: decided during surgery.
  const unknown = await create({ preop: { ...fullPreop(["", t.unknown], { ageYears: 61, sex: "MALE" }), procedures: [], procedureUndetermined: true } })
  await keep("unknown", unknown)

  // A child.
  const child = await create({ clinicalMode: "PEDIATRIC", preop: { clinicalMode: "PEDIATRIC", ageValue: 5, ageUnit: "YEARS", sex: "FEMALE", heightCm: 110, weightKg: 19, procedures: [{ label: t.tonsils[0] }], diagnoses: [{ label: t.tonsils[1] }], asaScore: "I" } })
  await keep("child", child)
  return { ids, codes }
}

async function unseed(request: APIRequestContext, seeded: Seeded | null) {
  if (!seeded) return
  for (const id of seeded.ids) {
    await request.delete(`/api/cases/${id}/cancel`, { headers: JSON_HEADERS }).catch(() => {})
    // A finished case is deleted only once reopened, inside the undo window.
    await request.post(`/api/cases/${id}/unfinalize`, { headers: JSON_HEADERS, data: {} }).catch(() => {})
    const deleted = await request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => null)
    if (deleted && !deleted.ok()) console.log(`[guide] left case ${id}: ${deleted.status()}`)
  }
}

const row = (page: Page, code: string) => page.locator("a").filter({ hasText: code }).first()

async function holdCard(page: Page, code: string) {
  const card = page.getByText(code, { exact: true }).first()
  await expect(card).toBeVisible({ timeout: 60_000 })
  await card.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  const box = (await card.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(900)
  await page.mouse.up()
}

test("the user guide's screens", async ({ browser }) => {
  for (const locale of LOCALES) {
    const m = MESSAGES[locale]
    const t = TEXT[locale]
    const setup = await withTheatres(t.theatres)
    const restoreHospital = await renameInstitutionOf(EMAIL_FOR["member-a"], t.hospital)
    const web = await contextFor(browser, "member-a")
    await lightTheme(web)
    let seeded: Seeded | null = null
    try {
      await speak(web.request, locale, t.clinician)
      seeded = await seed(web.request, locale, setup.theatres)
      const c = seeded.codes
      const page = await web.newPage()
      await page.setViewportSize(WEB)

      // ── Signing in (signed out) ──
      await step("login", async () => {
        const anonymous = await browser.newContext({ viewport: WEB })
        anonymous.setDefaultTimeout(30_000)
        await anonymous.addCookies([{ name: "lospor_login_locale_choice", value: locale, url: "http://localhost:3000" }, { name: "lospor_device_locale", value: locale, url: "http://localhost:3000" }, { name: "theme", value: "light", url: "http://localhost:3000" }])
        const signedOut = await anonymous.newPage()
        await signedOut.goto("/login", { waitUntil: "domcontentloaded" })
        await shot(signedOut, locale, "web-login")
        await signedOut.goto("/register", { waitUntil: "domcontentloaded" })
        await shot(signedOut, locale, "web-register")
        await anonymous.close()
      })

      // ── Dashboard ──
      await step("dashboard", async () => {
        await page.goto("/dashboard", { waitUntil: "domcontentloaded" })
        await expect(row(page, c.inTheatre.code)).toBeVisible({ timeout: 60_000 })
        await shot(page, locale, "web-dashboard")
        await shot(page, locale, "web-dashboard-full", { fullPage: true, wait: 200 })
      })
      await step("theatre menu", async () => {
        await row(page, c.allocation.code).getByTestId("theatre-button").click()
        await expect(page.getByTestId("theatre-menu")).toBeVisible()
        await shot(page, locale, "web-dashboard-theatre-menu")
        await page.keyboard.press("Escape")
        await page.mouse.click(5, 5)
      })
      await step("handover menu", async () => {
        await page.goto("/dashboard", { waitUntil: "domcontentloaded" })
        await row(page, c.allocation.code).getByRole("button", { name: new RegExp(`${m.transfer.handOver}|${m.transfer.assign}`) }).click()
        await shot(page, locale, "web-dashboard-handover")
        await page.mouse.click(5, 5)
      })
      await step("cancel dialog", async () => {
        await page.goto("/dashboard", { waitUntil: "domcontentloaded" })
        await row(page, c.allocation.code).getByTestId("cancel-procedure").click()
        await expect(page.getByTestId("cancel-dialog")).toBeVisible()
        await shot(page, locale, "web-cancel-dialog")
        await page.keyboard.press("Escape")
      })

      // ── The case forms ──
      await step("preop", async () => {
        await page.goto(`/cases/new?continue=${c.allocation.id}&step=0`, { waitUntil: "domcontentloaded" })
        await page.waitForLoadState("networkidle").catch(() => {})
        await shot(page, locale, "web-preop")
      })
      await step("preop not yet known", async () => {
        await page.goto(`/cases/new?continue=${c.unknown.id}&step=0`, { waitUntil: "domcontentloaded" })
        const tick = page.getByTestId("procedure-undetermined")
        await tick.scrollIntoViewIfNeeded()
        await page.evaluate(() => window.scrollBy(0, -160))
        await shot(page, locale, "web-preop-case-details")
      })
      await step("preop risk", async () => {
        await page.goto(`/cases/new?continue=${c.allocation.id}&step=0`, { waitUntil: "domcontentloaded" })
        await page.locator("#preop-sec-risk").scrollIntoViewIfNeeded()
        await shot(page, locale, "web-preop-risk")
      })
      await step("intraop", async () => {
        await page.goto(`/cases/new?continue=${c.inTheatre.id}&step=1`, { waitUntil: "domcontentloaded" })
        await page.waitForLoadState("networkidle").catch(() => {})
        await shot(page, locale, "web-intraop", { wait: 2500 })
      })
      await step("postop", async () => {
        await page.goto(`/cases/new?continue=${c.awaitingPostop.id}&step=2`, { waitUntil: "domcontentloaded" })
        await page.waitForLoadState("networkidle").catch(() => {})
        await shot(page, locale, "web-postop")
        await page.getByTestId("performed-procedure").scrollIntoViewIfNeeded()
        await shot(page, locale, "web-postop-discharge")
      })
      await step("child preop", async () => {
        await page.goto(`/cases/new?continue=${c.child.id}&step=0`, { waitUntil: "domcontentloaded" })
        await page.waitForLoadState("networkidle").catch(() => {})
        await shot(page, locale, "web-preop-child")
      })
      await step("summary", async () => {
        await page.goto(`/cases/${c.finished.id}`, { waitUntil: "domcontentloaded" })
        await page.waitForLoadState("networkidle").catch(() => {})
        await shot(page, locale, "web-case-summary", { wait: 2500 })
      })
      await step("cancelled summary", async () => {
        await page.goto(`/cases/${c.cancelled.id}`, { waitUntil: "domcontentloaded" })
        await shot(page, locale, "web-case-cancelled", { wait: 2000 })
      })
      await step("print", async () => {
        await page.goto(`/cases/${c.finished.id}/print`, { waitUntil: "domcontentloaded" })
        await page.waitForLoadState("networkidle").catch(() => {})
        await shot(page, locale, "web-print", { wait: 3000 })
      })

      // ── Unit indicators ──
      await step("indicators", async () => {
        await page.goto("/indicators", { waitUntil: "domcontentloaded" })
        await expect(page.getByTestId("indicators-cases")).toBeVisible({ timeout: 90_000 })
        await page.waitForTimeout(2000)
        await shot(page, locale, "web-indicators")
        await page.getByTestId("indicators-drugs").scrollIntoViewIfNeeded()
        await shot(page, locale, "web-indicators-drugs")
        await page.getByTestId("indicators-events").scrollIntoViewIfNeeded()
        await shot(page, locale, "web-indicators-events")
      })

      // ── Settings ──
      await step("settings", async () => {
        await page.goto("/dashboard", { waitUntil: "domcontentloaded" })
        await page.getByRole("button", { name: m.settings.accountSettings }).click()
        await shot(page, locale, "web-settings")
        await page.getByText(m.settings.title, { exact: true }).last().click()
        await shot(page, locale, "web-settings-page", { wait: 1500 })
      })

      // ── The phone ──
      const phone = await openPhone(browser, EMAIL_FOR["member-a"])
      // openPhone signs in with locale "en", which the account then keeps: say it again.
      await speak(web.request, locale, t.clinician)
      try {
        await lightTheme(phone.context)
        const p = phone.page
        await step("phone dashboard", async () => {
          await p.goto("/", { waitUntil: "domcontentloaded" })
          await expect(p.getByText(c.inTheatre.code, { exact: true }).first()).toBeVisible({ timeout: 90_000 })
          await shot(p, locale, "phone-dashboard")
        })
        await step("phone menu", async () => {
          await holdCard(p, c.allocation.code)
          await shot(p, locale, "phone-menu")
          await p.keyboard.press("Escape")
        })
        await step("phone preop", async () => {
          await p.goto(`/cases/new?continue=${c.allocation.id}`, { waitUntil: "domcontentloaded" })
          await shot(p, locale, "phone-preop", { wait: 3000 })
        })
        await step("phone intraop", async () => {
          await p.goto(`/cases/intraop/${c.inTheatre.id}`, { waitUntil: "domcontentloaded" })
          await shot(p, locale, "phone-intraop-equipment", { wait: 4000 })
          // Straight onto the timetable tab: in Bulgarian its name is also the chart button's.
          await p.goto(`/cases/intraop/${c.inTheatre.id}?focus=vitals`, { waitUntil: "domcontentloaded" })
          await shot(p, locale, "phone-intraop", { wait: 4000 })
          await p.getByText(/📊/).last().click({ timeout: 15_000 })
          await shot(p, locale, "phone-intraop-chart", { wait: 2500 })
        })
        await step("phone postop", async () => {
          await p.goto(`/cases/postop/${c.awaitingPostop.id}`, { waitUntil: "domcontentloaded" })
          await shot(p, locale, "phone-postop", { wait: 3000 })
        })
        await step("phone case", async () => {
          await p.goto(`/cases/${c.finished.id}`, { waitUntil: "domcontentloaded" })
          await shot(p, locale, "phone-case", { wait: 3000 })
        })
        await step("phone indicators", async () => {
          await p.goto("/indicators", { waitUntil: "domcontentloaded" })
          await expect(p.getByTestId("indicators-cases")).toBeVisible({ timeout: 90_000 })
          await shot(p, locale, "phone-indicators")
        })
      } finally {
        await phone.context.close()
      }

      // ── A head of department ──
      await step("head of department", async () => {
        const head = await contextFor(browser, "hod-a")
        await lightTheme(head)
        try {
          await speak(head.request, locale, t.head)
          const hodPage = await head.newPage()
          await hodPage.setViewportSize(WEB)
          await hodPage.goto("/dashboard", { waitUntil: "domcontentloaded" })
          await expect(row(hodPage, c.inTheatre.code)).toBeVisible({ timeout: 60_000 })
          await shot(hodPage, locale, "web-hod-dashboard")
        } finally {
          await head.close()
        }
      })

      // ── The cloud's administrator ──
      await step("admin", async () => {
        const admin = await contextFor(browser, "admin")
        await lightTheme(admin)
        try {
          await admin.request.patch("/api/user", { headers: JSON_HEADERS, data: { preferences: { ui: { locale } } } })
          const adminPage = await admin.newPage()
          await adminPage.setViewportSize(WEB)
          await adminPage.goto("/admin", { waitUntil: "domcontentloaded" })
          await shot(adminPage, locale, "web-admin", { wait: 2500 })
        } finally {
          await admin.close()
        }
      })
      // ── The research browser (its own app; started separately, see GUIDE_BROWSER_URL) ──
      const browserUrl = process.env.GUIDE_BROWSER_URL
      if (browserUrl) {
        await step("research browser", async () => {
          const restoreGrants = await widenResearchGrants(EMAIL_FOR.research)
          // Empty storage: the project's signed-in web cookie is for localhost too, and the browser would take it.
          const context = await browser.newContext({ viewport: WEB, baseURL: browserUrl, storageState: { cookies: [], origins: [] } })
          context.setDefaultTimeout(30_000)
          try {
            const research = await context.newPage()
            await research.goto("/login", { waitUntil: "domcontentloaded" })
            await research.getByRole("button", { name: locale === "bg" ? "Български" : "English" }).click()
            await shot(research, locale, "browser-login")
            await research.locator("input[type=email]").fill(EMAIL_FOR.research)
            await research.locator("input[type=password]").fill(E2E_PASSWORD)
            await research.locator("button[type=submit]").click()
            await research.waitForURL(/\/overview/, { timeout: 60_000 })
            // The account keeps its own language; the sign-in choice does not override it.
            const own = research.getByRole("button", { name: locale === "bg" ? "BG" : "EN", exact: true })
            if (await own.getAttribute("aria-pressed") === "false") await own.click()
            await research.waitForTimeout(1500)
            for (const screen of ["overview", "cohorts", "cases", "quality", "benchmarks", "compare", "exports", "governance"]) {
              await step(`browser ${screen}`, async () => {
                await research.goto(`/${screen}`, { waitUntil: "domcontentloaded" })
                await shot(research, locale, `browser-${screen}`, { wait: 4000 })
              })
            }
          } finally {
            await context.close()
            await restoreGrants()
          }
        })
      }
      await page.close()
    } finally {
      await unseed(web.request, seeded)
      await web.close()
      await setup.restore()
      await restoreHospital()
    }
  }
})
