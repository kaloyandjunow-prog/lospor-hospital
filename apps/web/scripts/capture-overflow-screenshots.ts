import { chromium, type Page } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { E2E_MEMBER_A_EMAIL, E2E_PASSWORD } from "../e2e/credentials"

// Use the same host as the normal E2E harness. The dev server's HMR/client
// origin is configured for localhost; 127.0.0.1 can serve the SSR HTML while
// silently failing to hydrate the interactive route.
const webBase = process.env.SCREENSHOT_WEB_BASE ?? "http://localhost:3000"
const pwaBase = process.env.SCREENSHOT_PWA_BASE ?? "http://localhost:3001"
const outputDir = process.env.SCREENSHOT_OUTPUT ?? path.resolve(process.cwd(), "..", "screenshot-runs", "overflow-20261105")

const headers = { Origin: webBase, "Content-Type": "application/json" }
const startedAt = new Date(Date.now() - 45 * 60_000).toISOString()

async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForTimeout(900)
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {})
  const file = path.join(outputDir, `${name}.png`)
  await page.screenshot({ path: file, fullPage })
  console.log(`captured ${name}`)
}

async function clickPhoneTab(page: Page, label: string) {
  const tab = page.getByText(label, { exact: true }).first()
  const width = page.viewportSize()?.width ?? 412
  for (let attempt = 0; attempt < 6; attempt++) {
    const box = await tab.boundingBox().catch(() => null)
    console.log("phone: tab attempt", attempt, box)
    if (box && box.x < width && box.x + box.width > 0) {
      console.log("phone: tab click")
      await tab.click({ timeout: 20_000 })
      console.log("phone: tab clicked")
      return
    }
    const next = page.getByRole("button", { name: /Scroll to next tabs|Към следващите раздели/ }).first()
    console.log("phone: next cue", await next.count())
    if (!(await next.count())) break
    await next.click({ timeout: 10_000 })
    // The cue uses an animated native/web scroll; allow the rail to settle
    // before measuring the target tab again.
    await page.waitForTimeout(350)
  }
  await tab.click({ timeout: 20_000 })
}

async function openIntraop(page: Page, caseId: string) {
  await page.goto(`/cases/new?continue=${caseId}&step=1`, { waitUntil: "domcontentloaded" })
  // The active edit-form route already owns the case and renders the
  // intraoperative form from ?step=1. The similarly worded pre-op submit
  // button is not a navigation control for this route; clicking it can submit
  // the pre-op form again and return the capture to /cases/new.
  await page.locator('[data-tour="intraop-timetable"]').waitFor({ state: "visible", timeout: 30_000 })
}

const preop = {
  ageYears: 45,
  sex: "MALE",
  heightCm: 182,
  weightKg: 82,
  clinicalMode: "ADULT",
  diagnoses: [{ label: "Cholelithiasis" }],
  procedures: [{ label: "Laparoscopic cholecystectomy" }],
  bpSystolic: 132,
  bpDiastolic: 78,
  heartRate: 72,
  respiratoryRate: 14,
  mallampati: "II",
  asaScore: "II",
}

const events = [
  { id: "overflow-drug-1", type: "drug", ts: new Date(Date.now() - 18 * 60_000).toISOString(), name: "Propofol", dose: "150", unit: "mg", drugRoute: "IV" },
  { id: "overflow-drug-2", type: "drug", ts: new Date(Date.now() - 16 * 60_000).toISOString(), name: "Fentanyl", dose: "100", unit: "mcg", drugRoute: "IV" },
  { id: "overflow-infusion-1", type: "infusion_start", ts: new Date(Date.now() - 14 * 60_000).toISOString(), infId: "overflow-remi", name: "Remifentanil", rate: "0.15", unit: "mcg/kg/min", color: "#3b82f6" },
]

async function main() {
  await mkdir(outputDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  let caseId: string | null = null
  // The running PWA and web server share the API's HttpOnly session contract,
  // but use different browser origins. Authenticate once through the working
  // PWA path and copy only the session cookie to the web origin.
  const phone = await browser.newContext({ baseURL: pwaBase, viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  const session = await phone.request.post("/v1/auth/session", {
    headers: { "Content-Type": "application/json", Origin: pwaBase, "X-LOSPOR-Client": "pwa", "X-LOSPOR-Client-Version": "10.2.0-screenshot" },
    data: { email: E2E_MEMBER_A_EMAIL, password: E2E_PASSWORD, locale: "en", deviceLabel: "Overflow screenshot" },
  })
  if (session.status() !== 200) throw new Error(`PWA session failed: ${session.status()}`)
  const web = await browser.newContext({ baseURL: webBase, viewport: { width: 1440, height: 900 } })
  await web.addCookies((await phone.cookies()).map(cookie => ({ name: cookie.name, value: cookie.value, url: webBase })))
  let previousPreferences: unknown = undefined

try {
  const user = await web.request.get("/api/user", { headers: { Origin: webBase } })
  if (user.ok()) previousPreferences = (await user.json() as { preferences?: unknown }).preferences
  // Capture the compact/smart catalogue rather than whichever legacy choice
  // the shared demo member happened to have from an earlier manual run.
  await web.request.patch("/api/user", {
    headers,
    data: { preferences: { ui: { locale: "en" }, airwayScreen: "smart", equipmentScreen: "smart", monitoringScreen: "smart", vascularScreen: "smart", techniqueScreen: "smart" } },
  })

  const created = await web.request.post("/api/cases", {
    headers,
    data: { preop, intraop: { startedAt, timezone: "Europe/Sofia", techniques: ["GENERAL_TIVA"], nbpMonitor: true, ecg: true, spO2Monitor: true } },
  })
  if (!created.ok()) throw new Error(`case creation failed: ${created.status()} ${await created.text()}`)
  caseId = (await created.json() as { id: string }).id
  for (const event of events) {
    const response = await web.request.post(`/api/cases/${caseId}/events`, { headers, data: event })
    if (!response.ok()) throw new Error(`event seed failed: ${response.status()}`)
  }

  // Capture the mobile view before opening the case in a second browser
  // context. The product correctly locks a case to one active editor, so this
  // ordering keeps the mobile screenshots focused on the actual UI rather
  // than the hand-off banner.
  const phonePage = await phone.newPage()
  try {
    await phonePage.goto(`/cases/intraop/${caseId}`, { waitUntil: "domcontentloaded" })
    await phonePage.getByText(/Intraoperative|Интраоперативно/).first().waitFor({ state: "visible", timeout: 30_000 })
    await phonePage.getByText("Laparoscopic cholecystectomy", { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 })
    await shot(phonePage, "phone-01-tab-rail", false)
    await clickPhoneTab(phonePage, "Airway")
    // React Native Web does not expose every native testID as data-testid in
    // the static PWA bundle; the visible section heading is the stable product
    // marker for the smart airway screen.
    await phonePage.waitForFunction(
      () => document.body.innerText.includes("ADD A DEVICE") || document.body.innerText.includes("ДОБАВЯНЕ НА УСТРОЙСТВО"),
      undefined,
      { timeout: 30_000 },
    )
    await shot(phonePage, "phone-02-airway-cue", false)
    const more = phonePage.getByText(/Other airway devices|Други устройства/).first()
    if (await more.count()) {
      await more.click()
      await shot(phonePage, "phone-03-airway-more-devices", false)
    }
    await phonePage.mouse.wheel(0, 620)
    await phonePage.waitForTimeout(500)
    await shot(phonePage, "phone-04-header-collapsed", false)
  } finally {
    await phonePage.close().catch(() => {})
  }

  const webPage = await web.newPage()
  try {
  await openIntraop(webPage, caseId)
  const takeOverEditing = webPage.getByRole("button", { name: /Take over editing|Поеми редактирането/ }).first()
  if (await takeOverEditing.count() && await takeOverEditing.isVisible().catch(() => false)) {
    await takeOverEditing.click({ timeout: 20_000 })
    const confirmTakeOver = webPage.getByRole("button", { name: /Confirm|Потвърди/ }).first()
    if (await confirmTakeOver.count() && await confirmTakeOver.isVisible().catch(() => false)) {
      await confirmTakeOver.click({ timeout: 20_000 })
    }
    await webPage.waitForTimeout(700)
  }
  await shot(webPage, "web-01-intraop", true)

  const timetable = webPage.locator('[data-tour="intraop-timetable"]')
  await timetable.scrollIntoViewIfNeeded()
  await shot(webPage, "web-02-timeline", false)

  const addDrug = webPage.getByTestId("add-drug").first()
  if (await addDrug.count()) {
    await addDrug.click()
    await shot(webPage, "web-03-drug-picker")
    await webPage.getByRole("button", { name: /^Induction/ }).first().click({ timeout: 10_000 })
    await webPage.getByRole("button", { name: /^Propofol/ }).first().click({ timeout: 10_000 })
    await shot(webPage, "web-04-propofol-dosing")
  }

  await openIntraop(webPage, caseId)
  await webPage.getByText(/Anaesthesia technique|Anesthesia technique|Анестезия/).first().scrollIntoViewIfNeeded().catch(() => {})
  await shot(webPage, "web-05-technique", false)
  } finally {
    await webPage.close().catch(() => {})
  }
  } finally {
    if (caseId) await web.request.delete(`/api/cases/${caseId}`, { headers }).catch(() => {})
    if (previousPreferences !== undefined) await web.request.patch("/api/user", { headers, data: { preferences: previousPreferences } }).catch(() => {})
    await web.close()
    await phone.close().catch(() => {})
    await browser.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
