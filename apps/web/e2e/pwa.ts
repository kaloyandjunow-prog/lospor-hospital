import { type Browser, type BrowserContext, type Page } from "@playwright/test"
import { E2E_PASSWORD } from "./credentials"

// Opening the phone app from the web app's suite.
//
// The two apps do not share a cookie because the development harness serves
// them on different ports. Both now use HttpOnly sessions, so the phone-sized
// context signs in through the PWA's own same-origin /v1 proxy. No bearer
// credential is ever written into browser storage.

export const PWA_BASE = process.env.PWA_E2E_BASE_URL ?? "http://localhost:3001"
/**
 * A phone-sized context with `email` already signed in.
 *
 * The request context and page share one cookie jar. Signing in before the page
 * opens therefore exercises the real browser session while avoiding a login
 * flash that looks like a broken clinical route.
 */
export async function openPhone(
  browser: Browser,
  email: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: PWA_BASE,
    viewport: { width: 412, height: 915 },
  })
  const session = await context.request.post("/v1/auth/session", {
    headers: {
      "Content-Type": "application/json",
      Origin: PWA_BASE,
      "X-LOSPOR-Client": "pwa",
      "X-LOSPOR-Client-Version": "9.3.0-e2e",
    },
    data: {
      email,
      password: E2E_PASSWORD,
      locale: "en",
      deviceLabel: "Playwright phone",
    },
  })
  if (session.status() !== 200) {
    const detail = await session.text()
    await context.close()
    throw new Error(`could not create a PWA browser session for ${email}: ${session.status()} ${detail}`)
  }
  const page = await context.newPage()
  return { context, page }
}

/**
 * The phone app's own route into a case's preoperative form.
 *
 * Taken from what the app navigates to itself rather than assembled here: the
 * Expo router drops the `(app)` group from the URL, so a hand-built path that
 * includes it silently renders nothing.
 */
export const phonePreopPath = (caseId: string) => `/cases/new?continue=${caseId}`
export const phoneIntraopPath = (caseId: string) => `/cases/intraop/${caseId}`

/**
 * Opens a case's preoperative form on the phone, with the fields actually
 * mounted.
 *
 * The phone app opens on a section index — "Tap a section to fill or review
 * it" — and none of the fields exist in the page until a section is chosen.
 * Waiting only for the heading gives a screen that looks loaded and contains no
 * inputs at all, which reads as a sync failure rather than a form that has not
 * been opened yet.
 *
 * `section` decides which one is tapped; the whole form mounts either way, so
 * it only sets where the view starts.
 */
export async function openPhonePreop(
  page: Page,
  caseId: string,
  section = "Demographics",
): Promise<void> {
  await page.goto(phonePreopPath(caseId))
  await page.getByText("Preoperative assessment").first().waitFor({ state: "visible" })
  await page.getByText(section, { exact: true }).first().waitFor({ state: "visible" })
  await page.getByText(section, { exact: true }).first().click()
  // The fields, rather than the heading above them.
  await page.locator("input, textarea").first().waitFor({ state: "attached" })
  await settle(page)
}

/** Opens the real PWA intraoperative surface and waits for server hydration. */
export async function openPhoneIntraop(page: Page, caseId: string): Promise<void> {
  const hydrated = page.waitForResponse(response =>
    response.url().includes(`/v1/cases/${encodeURIComponent(caseId)}`)
    && response.request().method() === "GET"
    && response.status() === 200,
  )
  await page.goto(phoneIntraopPath(caseId))
  await hydrated
  await page.getByText("Intraoperative", { exact: true }).first().waitFor({ state: "visible" })
  await page.getByText("Timetable", { exact: true }).first().waitFor({ state: "visible" })
  await page.waitForTimeout(1_200)
}

/**
 * Waits until the form stops rewriting itself.
 *
 * The case is fetched after the form mounts and then hydrated into it, so for a
 * short window the fields are still being assigned. Typing into that window
 * loses whatever was typed before the hydration landed — measurably: at a 300ms
 * keystroke delay, "Consented on the ward" arrived as "sented on the ward".
 *
 * A test that typed immediately would be measuring that race rather than
 * whatever it meant to assert, and would fail differently on a faster or slower
 * machine. Specs that are *about* the race should drive it deliberately instead.
 */
export async function settle(page: Page, quietMs = 1_200): Promise<void> {
  const field = page.locator("input, textarea").first()
  let previous = await field.inputValue().catch(() => "")
  const deadline = Date.now() + 15_000
  for (;;) {
    await page.waitForTimeout(quietMs)
    const current = await field.inputValue().catch(() => "")
    if (current === previous || Date.now() > deadline) return
    previous = current
  }
}
