import path from "path"
import { test, expect } from "@playwright/test"
import { contextFor, JSON_HEADERS } from "./roles"
import { E2E_MEMBER_A_EMAIL, E2E_PASSWORD } from "./credentials"
import { PWA_BASE } from "./pwa"

// The phone's display size (10.0.0): at 130% the app is laid out for a
// narrower window and drawn larger, so it reflows instead of running off the
// side -- which CSS zoom did, for every screen sized from the window width.

test.describe.configure({ timeout: 240_000 })

test("at 130% the phone app reflows to fit, intraop and postop included", async ({ browser }) => {
  const web = await contextFor(browser, "member-a")
  const created = await web.request.post("/api/cases", { headers: JSON_HEADERS, data: { patientNumber: `DISPLAY-SIZE-E2E-${Date.now()}`, preop: { ageYears: 50, sex: "MALE", heightCm: 175, weightKg: 80 } } })
  expect(created.status(), await created.text()).toBe(201)
  const { id } = await created.json()
  const phone = await browser.newContext({ baseURL: PWA_BASE, viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.625 })
  try {
    const session = await phone.request.post("/v1/auth/session", {
      headers: { "Content-Type": "application/json", Origin: PWA_BASE, "X-LOSPOR-Client": "pwa", "X-LOSPOR-Client-Version": "9.3.0-e2e" },
      data: { email: E2E_MEMBER_A_EMAIL, password: E2E_PASSWORD, locale: "en", deviceLabel: "Playwright phone" },
    })
    expect(session.status(), await session.text()).toBe(200)
    await phone.addInitScript(() => localStorage.setItem("lospor_ss_lospor_ui_scale", "130"))
    const page = await phone.newPage()
    for (const [name, url, ready] of [
      ["postop", `/cases/postop/${id}`, "postop-pill-score"],
      ["intraop", `/cases/intraop/${id}`, null],
    ] as const) {
      await page.goto(url)
      if (ready) await expect(page.getByTestId(ready)).toBeVisible({ timeout: 60_000 })
      else await page.waitForTimeout(6000)
      const size = await page.evaluate(() => ({ inner: innerWidth, scroll: document.documentElement.scrollWidth }))
      expect(size.inner, name).toBe(Math.round(412 / 1.3))
      expect(size.scroll, name).toBeLessThanOrEqual(size.inner)
      // Clipped overflow passes the check above: a row near the right edge must be wholly on screen.
      if (name === "intraop") await expect(page.getByText("Male", { exact: true }).first()).toBeInViewport({ ratio: 1 })
      else await expect(page.getByTestId("postop-pill-score")).toBeInViewport({ ratio: 1 })
      if (process.env.DISPLAY_SHOTS_DIR) await page.screenshot({ path: path.join(process.env.DISPLAY_SHOTS_DIR, `phone-130-${name}.png`) })
    }
  } finally {
    await phone.close()
    await web.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS })
    await web.close()
  }
})
