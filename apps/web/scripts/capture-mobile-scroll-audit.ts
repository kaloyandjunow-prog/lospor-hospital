import { chromium, type Page } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { E2E_MEMBER_A_EMAIL, E2E_PASSWORD } from "../e2e/credentials"

const pwaBase = process.env.SCREENSHOT_PWA_BASE ?? "http://localhost:3001"
const webBase = process.env.SCREENSHOT_WEB_BASE ?? "http://localhost:3000"
const outputDir = process.env.SCREENSHOT_OUTPUT ?? path.resolve(process.cwd(), "..", "screenshot-runs", "mobile-scroll-audit-20261105")
const headers = { Origin: webBase, "Content-Type": "application/json" }

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

async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForTimeout(700)
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage })
  console.log(`captured ${name}`)
}

async function open(page: Page, route: string, marker: RegExp) {
  await page.goto(route, { waitUntil: "domcontentloaded" })
  await page.getByText(marker).first().waitFor({ state: "visible", timeout: 30_000 })
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const phone = await browser.newContext({ baseURL: pwaBase, viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  const session = await phone.request.post("/v1/auth/session", {
    headers: { ...headers, Origin: pwaBase, "X-LOSPOR-Client": "pwa", "X-LOSPOR-Client-Version": "10.2.0-scroll-audit" },
    data: { email: E2E_MEMBER_A_EMAIL, password: E2E_PASSWORD, locale: "en", deviceLabel: "Scroll audit" },
  })
  if (session.status() !== 200) throw new Error(`PWA session failed: ${session.status()}`)

  const web = await browser.newContext({ baseURL: webBase, viewport: { width: 1440, height: 900 } })
  await web.addCookies((await phone.cookies()).map(cookie => ({ name: cookie.name, value: cookie.value, url: webBase })))
  let caseId: string | null = null
  try {
    const dashboard = await phone.newPage()
    await dashboard.goto("/", { waitUntil: "domcontentloaded" })
    await dashboard.getByTestId("dashboard-filters").waitFor({ state: "attached", timeout: 30_000 })
    await dashboard.waitForTimeout(500)
    await shot(dashboard, "01-dashboard-filter-rail")
    const filterRail = dashboard.getByTestId("dashboard-filters").first()
    if (await filterRail.count()) {
      await filterRail.scrollIntoViewIfNeeded()
      await shot(dashboard, "02-dashboard-filters")
      const filterButton = dashboard.getByText(/Anaesthesiologist|анестезиолог/).first()
      if (await filterButton.count() && await filterButton.isVisible().catch(() => false)) {
        await filterButton.click()
        await shot(dashboard, "03-dashboard-filter-sheet")
      }
    }
    await dashboard.close()

    const settings = await phone.newPage()
    await open(settings, "/settings", /Settings|Настройки/)
    await shot(settings, "04-settings-main")
    const settingsRows = settings.getByText("Settings", { exact: true })
    if (await settingsRows.count() > 1) {
      await settingsRows.last().click()
      await settings.waitForTimeout(500)
      await shot(settings, "05-settings-preferences")
    }
    await settings.close()

    const indicators = await phone.newPage()
    await open(indicators, "/indicators", /Unit indicators|Индикатори/)
    await shot(indicators, "06-unit-indicators", true)
    await indicators.close()

    const created = await web.request.post("/api/cases", {
      headers,
      data: { preop, intraop: { startedAt: new Date(Date.now() - 45 * 60_000).toISOString(), timezone: "Europe/Sofia", techniques: ["GENERAL_TIVA"], nbpMonitor: true, ecg: true, spO2Monitor: true } },
    })
    if (!created.ok()) throw new Error(`case creation failed: ${created.status()} ${await created.text()}`)
    caseId = (await created.json() as { id: string }).id

    const preopPage = await phone.newPage()
    await open(preopPage, `/cases/new?continue=${caseId}`, /Preoperative|Предоперативно/)
    await shot(preopPage, "07-preop-overview", true)
    const wardOrders = preopPage.getByText(/Orders|Назначения/).first()
    if (await wardOrders.count()) {
      await wardOrders.click()
      await preopPage.waitForTimeout(700)
      await shot(preopPage, "08-preop-orders", false)
    }
    await preopPage.close()

    const timetable = await phone.newPage()
    await open(timetable, `/cases/timetable/${caseId}`, /Intraop timetable|Интраоперативна времева линия/)
    await shot(timetable, "09-timetable-viewer", false)
    await timetable.close()
  } finally {
    if (caseId) await web.request.delete(`/api/cases/${caseId}`, { headers }).catch(() => {})
    await web.close()
    await phone.close()
    await browser.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
