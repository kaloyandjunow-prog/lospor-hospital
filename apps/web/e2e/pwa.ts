import { request as playwrightRequest, type Browser, type BrowserContext, type Page } from "@playwright/test"
import { E2E_PASSWORD } from "./credentials"

// Opening the phone app from the web app's suite.
//
// The two apps do not share a session. The web app is Next.js on a cookie; the
// PWA is lospor-mobile exported by Expo, and it authenticates with a bearer
// token it keeps in localStorage. So a cross-app spec cannot reuse
// `storageState` — it has to put a token where the phone app looks for it.

export const PWA_BASE = process.env.PWA_E2E_BASE_URL ?? "http://localhost:3001"
export const API_BASE = process.env.E2E_API_BASE ?? "http://localhost:3002"

// src/lib/secure-store-web.ts prefixes everything it stores.
const TOKEN_KEY = "lospor_ss_lospor_access_token"

/**
 * A synthetic client address, different on every run.
 *
 * Sign-in is rate limited per address, and a suite signing several accounts in
 * from one place is indistinguishable from credential stuffing. Rather than
 * weaken the limit, the suite stops sharing a bucket with it — and with the
 * previous run.
 */
const runAddress = `10.99.${1 + Math.floor(Math.random() * 200)}.${1 + Math.floor(Math.random() * 200)}`

async function tokenFor(email: string): Promise<string> {
  const api = await playwrightRequest.newContext()
  try {
    const response = await api.post(`${API_BASE}/v1/auth/token`, {
      headers: { "Content-Type": "application/json", "x-forwarded-for": runAddress },
      data: { email, password: E2E_PASSWORD },
    })
    if (response.status() !== 200) {
      throw new Error(`could not mint a phone token for ${email}: ${await response.text()}`)
    }
    const { access_token: token } = await response.json() as { access_token?: string }
    if (!token) throw new Error(`no access_token returned for ${email}`)
    return token
  } finally {
    await api.dispose()
  }
}

/**
 * A phone-sized context with `email` already signed in.
 *
 * The token goes in before any script runs, so the app boots authenticated
 * rather than flashing the login screen — which it otherwise does, and which
 * looks exactly like a broken test.
 */
export async function openPhone(
  browser: Browser,
  email: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const token = await tokenFor(email)
  const context = await browser.newContext({
    baseURL: PWA_BASE,
    viewport: { width: 412, height: 915 },
  })
  const page = await context.newPage()
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key!, value!), [TOKEN_KEY, token])
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
