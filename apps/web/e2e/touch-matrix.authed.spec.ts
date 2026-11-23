import { test, expect, devices, type Page } from "@playwright/test"

/**
 * The touch matrix on a tablet and a phone-width window (TACH-MATRICA, 10.8.0): on every screen, each control a
 * finger can press has a 44 px target (its own size, or the invisible hit area around it), and text is never
 * under 12 px. The chart's own cells and the printed sheets are measured elsewhere. A failure names the element.
 */
const ORIGIN = process.env.E2E_BASE_URL ?? "http://localhost:3300"
test.describe.configure({ timeout: 240_000 })

type Failure = { kind: "target" | "text"; where: string; detail: string }

async function audit(page: Page): Promise<Failure[]> {
  return page.evaluate(() => {
    const failures: { kind: "target" | "text"; where: string; detail: string }[] = []
    const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""}.${String(el.getAttribute("class") || "").split(" ").slice(0, 3).join(".")} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 32)}"`
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0" }
    const interactiveSel = 'button, a[href], select, textarea, input:not([type="hidden"]), summary, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="option"]'
    const isInteractive = (el: Element | null) => !!el?.closest(interactiveSel)
    const root = document.body
    for (const el of root.querySelectorAll<HTMLElement>(interactiveSel)) {
      if (!visible(el) || (el as HTMLButtonElement).disabled || el.closest("[data-intraop-chart-root], [data-print-sheet], .rec-sheet, .print-only, .sr-only, [aria-hidden='true']")) continue
      if (el instanceof HTMLInputElement && ["checkbox", "radio", "range", "file", "color"].includes(el.type)) continue
      const r = el.getBoundingClientRect()
      if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.height > 2000) continue
      const shortW = r.width < 43.5, shortH = r.height < 43.5
      if (!shortW && !shortH) continue
      // The hit area around it: points up to 22 px from the centre must still land on it (or on a neighbouring control).
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2
      const probes: [number, number][] = []
      if (shortH) probes.push([cx, cy - 21], [cx, cy + 21])
      if (shortW) probes.push([cx - 21, cy], [cx + 21, cy])
      const ok = probes.every(([x, y]) => { if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return true; const hit = document.elementFromPoint(x, y); return !hit || el.contains(hit) || hit.closest(interactiveSel) === el || isInteractive(hit) })
      if (!ok) failures.push({ kind: "target", where: describe(el), detail: `${Math.round(r.width)}x${Math.round(r.height)}` })
    }
    for (const el of root.querySelectorAll<HTMLElement>("*")) {
      if (!visible(el) || el.closest("[data-intraop-chart-root], [data-print-sheet], .rec-sheet, .print-only, .sr-only, svg, script, style")) continue
      if (![...el.childNodes].some(n => n.nodeType === 3 && (n.textContent || "").trim().length > 0)) continue
      const size = parseFloat(getComputedStyle(el).fontSize)
      if (size < 11.99) failures.push({ kind: "text", where: describe(el), detail: `${size}px` })
    }
    return failures
  })
}

async function report(page: Page, name: string, failures: Failure[]) {
  const unique = [...new Map(failures.map(item => [item.kind + item.where, item])).values()]
  expect(unique, `${name}\n${unique.slice(0, 40).map(item => `  ${item.kind}: ${item.where} (${item.detail})`).join("\n")}`).toEqual([])
}

// A touch device, so that (pointer: coarse) holds: the tablet of the matrix's own measurement, and a phone.
const withoutBrowser = ({ defaultBrowserType: _browser, ...device }: (typeof devices)[string]) => device
const SCREENS = [
  { device: withoutBrowser(devices["Galaxy Tab S4 landscape"]), label: "tablet" },
  { device: withoutBrowser(devices["Pixel 5"]), label: "phone" },
]

for (const { device, label } of SCREENS) {
  test.describe(label, () => {
    test.use(device)

    for (const path of ["/dashboard", "/account", "/admin", "/indicators", "/clinical-rules", "/cases/new", "/terms", "/privacy"]) {
      test(`${path} has 44 px targets and 12 px text`, async ({ page }) => {
        await page.goto(path, { waitUntil: "domcontentloaded" })
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {})
        await page.waitForTimeout(1_000)
        await report(page, path, await audit(page))
      })
    }

    test("the dashboard row menu and the settings menu", async ({ page }) => {
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" })
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {})
      await page.waitForTimeout(1_000)
      const rowMenu = page.getByTestId("case-row-menu").first()
      if (await rowMenu.isVisible().catch(() => false)) { await rowMenu.scrollIntoViewIfNeeded(); await rowMenu.click({ force: true, timeout: 5_000 }); await page.waitForTimeout(500); await report(page, "row menu", await audit(page)); await page.keyboard.press("Escape"); await page.mouse.click(2, 2) }
      await page.locator("[data-testid='account-settings-trigger'], [data-tour='settings-menu'] button").first().click({ timeout: 4_000 }).catch(() => {})
      await page.waitForTimeout(800)
      await report(page, "settings menu", await audit(page))
    })

    test("the signed-out screens", async ({ browser }) => {
      const context = await browser.newContext({ ...device, storageState: { cookies: [], origins: [] }, baseURL: ORIGIN })
      const page = await context.newPage()
      try {
        for (const path of ["/login", "/register", "/forgot-password"]) {
          await page.goto(path, { waitUntil: "domcontentloaded" })
          await page.waitForTimeout(1_200)
          await report(page, path, await audit(page))
        }
      } finally { await context.close() }
    })

    test("the case's steps have 44 px targets and 12 px text", async ({ page }) => {
      const created = await page.request.post("/api/cases", { headers: { Origin: ORIGIN }, data: { patientNumber: `TOUCH-MATRIX-E2E-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, preop: { ageYears: 41, sex: "MALE", heightCm: 178, weightKg: 82, clinicalMode: "ADULT" }, intraop: { startTime: "08:00", techniques: ["GENERAL_INHALATION"] } } })
      expect(created.ok()).toBeTruthy()
      const { id } = await created.json() as { id: string }
      try {
        for (const step of [0, 1, 2, 3]) {
          await page.goto(`/cases/new?continue=${id}&step=${step}`, { waitUntil: "domcontentloaded" })
          await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {})
          await page.waitForTimeout(1_500)
          await report(page, `step ${step}`, await audit(page))
          // Each tab and section of the step, one by one.
          const tabs = page.locator('[role="tab"], [data-testid="sidebar-sections"] button')
          const count = Math.min(await tabs.count(), 12)
          for (let i = 0; i < count; i++) {
            await tabs.nth(i).click({ timeout: 3_000 }).catch(() => {})
            await page.waitForTimeout(500)
            await report(page, `step ${step} tab ${i}`, await audit(page))
          }
        }
      } finally {
        await page.goto("about:blank")
        await page.request.delete(`/api/cases/${id}`, { headers: { Origin: ORIGIN } })
      }
    })
  })
}
