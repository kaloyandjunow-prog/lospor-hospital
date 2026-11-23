import { expect, test, type Page } from "@playwright/test"
import { ACCOUNTS, API_BASE, signInAs, tokenFor } from "./session"

// The touch matrix on the phone (TACH-MATRICA, 10.8.0): on every screen what a finger presses is at least 44 px
// in both directions, and text is never under 12 px. A failure names the element and its size.
const SCREENS = ["/", "/settings"]
const TABS = ["Timing", "Equipment", "Technique", "Position", "Monitoring", "Airway", "Vascular", "Premedication", "Timetable", "Fluid status", "Event log"]

async function audit(page: Page) {
  return page.evaluate(() => {
    const failures: string[] = []
    const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}"`
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0" }
    for (const el of document.querySelectorAll<HTMLElement>('button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [tabindex="0"]')) {
      if (!visible(el) || el.getAttribute("aria-disabled") === "true" || el.closest("[aria-hidden='true']")) continue
      const r = el.getBoundingClientRect()
      if (r.right < 0 || r.left > innerWidth || r.height > 1500) continue
      // A timetable cell is its whole row (measured by the web guard's twin); only controls inside are checked here.
      if (r.width < 43.5 || r.height < 43.5) failures.push(`target: ${describe(el)} (${Math.round(r.width)}x${Math.round(r.height)})`)
    }
    for (const el of document.querySelectorAll<HTMLElement>("div, span")) {
      if (!visible(el) || ![...el.childNodes].some(n => n.nodeType === 3 && (n.textContent || "").trim().length > 0)) continue
      const size = parseFloat(getComputedStyle(el).fontSize)
      if (size < 11.99) failures.push(`text: ${describe(el)} (${size}px)`)
    }
    return failures
  })
}

// Every screen is measured before the test says anything, so one run lists all that is wrong.
const problems: string[] = []
async function report(page: Page, name: string) {
  for (const item of new Set(await audit(page))) problems.push(`${name}: ${item}`)
}

test.use({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
test.describe.configure({ timeout: 240_000 })

test("the phone's screens have 44 px targets and 12 px text", async ({ page, request }) => {
  const token = await tokenFor(request, ACCOUNTS.admin)
  const authed = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  const created = await request.post(`${API_BASE}/v1/cases`, { headers: authed, data: { patientNumber: `TOUCH-MATRIX-PWA-E2E-${Date.now()}`, preop: { procedureName: "Touch matrix", diagnosis: "Touch matrix", asaClass: 2, age: 54, weight: 78, height: 172, sex: "FEMALE", urgency: "ELECTIVE" } } })
  expect(created.ok()).toBe(true)
  const caseId: string = (await created.json()).id
  await signInAs(page, request, ACCOUNTS.admin)
  const settle = async () => { await page.waitForFunction(() => !/Loading|Зареждане/.test(document.body.innerText) && document.body.innerText.trim().length > 40, undefined, { timeout: 60_000 }).catch(() => {}); await page.waitForTimeout(1500) }
  try {
    for (const path of [...SCREENS, `/cases/${caseId}`, `/cases/postop/${caseId}`, `/cases/new?continue=${caseId}`]) {
      await page.goto(path, { waitUntil: "domcontentloaded" }); await settle()
      await report(page, path)
    }
    await page.goto(`/cases/intraop/${caseId}`, { waitUntil: "domcontentloaded" }); await settle()
    await page.getByText("Start now", { exact: false }).first().click({ timeout: 8_000 }).catch(() => {})
    await page.waitForTimeout(1500)
    for (const tab of TABS) {
      const target = page.getByText(tab, { exact: true }).first()
      if (!(await target.isVisible().catch(() => false))) continue
      await target.click({ timeout: 4_000 }).catch(() => {})
      await page.waitForTimeout(700)
      await report(page, `intraop · ${tab}`)
    }
  } finally {
    await request.delete(`${API_BASE}/v1/cases/${caseId}`, { headers: authed }).catch(() => {})
  }
  expect(problems).toEqual([])
})
