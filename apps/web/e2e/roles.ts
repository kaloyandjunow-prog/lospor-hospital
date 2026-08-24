import path from "path"
import type { Browser, BrowserContext, Page } from "@playwright/test"
import {
  E2E_EMAIL, E2E_PASSWORD,
  E2E_HOD_A_EMAIL, E2E_MEMBER_A_EMAIL, E2E_MEMBER_A2_EMAIL,
  E2E_HOD_B_EMAIL, E2E_MEMBER_B_EMAIL, E2E_RESEARCH_EMAIL,
} from "./credentials"

// The cast, and how a spec borrows one of them.
//
// Most of what 8.3 added is a rule about *who*: which head of department sees a
// request, whose cases a head can open, who may approve a move. A single signed-in
// identity cannot demonstrate any of it — the assertion that matters is always
// that somebody else is refused. So specs build a context per person rather than
// relying on the project's own storageState.
//
// auth.setup.ts writes these files; `npm run e2e:seed` creates the accounts.

export type Role =
  | "admin" | "hod-a" | "member-a" | "member-a2" | "hod-b" | "member-b" | "research"


export const storageStateFor = (role: Role) =>
  path.join(__dirname, ".auth", `${role}.json`)

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000"

// Cookie-auth writes are CSRF-guarded: the Origin header must equal the app
// origin, and an APIRequestContext does not send one on its own.
export const ORIGIN = BASE_URL

export const JSON_HEADERS = { Origin: ORIGIN, "Content-Type": "application/json" }

/**
 * A browser context signed in as `role`. Contexts made by hand do not inherit
 * `use.baseURL` from the config, so it is passed explicitly — without it every
 * relative request in a spec would fail with "invalid URL".
 */
export function contextFor(browser: Browser, role: Role): Promise<BrowserContext> {
  return browser.newContext({ storageState: storageStateFor(role), baseURL: BASE_URL })
}

/** Runs `body` with a context for each named role and always closes them. */
export async function withRoles<T>(
  browser: Browser,
  roles: Role[],
  body: (contexts: Record<string, BrowserContext>) => Promise<T>,
): Promise<T> {
  const opened: BrowserContext[] = []
  try {
    const entries: [string, BrowserContext][] = []
    for (const role of roles) {
      const context = await contextFor(browser, role)
      opened.push(context)
      entries.push([role, context])
    }
    return await body(Object.fromEntries(entries))
  } finally {
    for (const context of opened) await context.close().catch(() => {})
  }
}

export const EMAIL_FOR: Record<Role, string> = {
  "admin":     E2E_EMAIL,
  "hod-a":     E2E_HOD_A_EMAIL,
  "member-a":  E2E_MEMBER_A_EMAIL,
  "member-a2": E2E_MEMBER_A2_EMAIL,
  "hod-b":     E2E_HOD_B_EMAIL,
  "member-b":  E2E_MEMBER_B_EMAIL,
  "research":  E2E_RESEARCH_EMAIL,
}

// The sign-in form, addressed by id rather than by input type.
//
// 1.2.0 made the first field username-or-email, and a deployment configured for
// usernames renders it as type="text". `input[type="email"]` therefore stops
// matching on exactly the deployments where sign-in matters most. The ids are
// set by the component and move with neither the deployment nor the wording.
export const LOGIN_IDENTIFIER = "#login-identifier"
export const LOGIN_PASSWORD = "#login-password"
export const LOGIN_SUBMIT = 'button[type="submit"]'

/** Signs `email` in through the real form and waits for the dashboard. */
export async function signInWithPassword(page: Page, email: string): Promise<void> {
  await page.goto(`${BASE_URL}/login`)
  await page.waitForLoadState("networkidle") // ensure the client has hydrated
  await page.locator(LOGIN_IDENTIFIER).fill(email)
  await page.locator(LOGIN_PASSWORD).fill(E2E_PASSWORD)
  await page.locator(LOGIN_SUBMIT).click()
  await page.waitForURL("**/dashboard", { timeout: 30_000 })
}

/**
 * Sign `role` in again inside a context that is already open, and save the new
 * session over the file auth.setup.ts wrote.
 *
 * Since 1.2.0 an approved institution change revokes every session the moved
 * clinician holds and stamps a new password epoch on their account — see
 * revokeAllSessionsInTransaction in the API's admin/institution-requests route
 * — so the cookie they were carrying stops being accepted the moment the
 * receiving head of department approves. That is the intended behaviour: a move
 * changes which department's data the person is inside, and it must not be
 * possible to keep working through a session issued before the move. In the
 * application the clinician is simply asked to sign in again.
 *
 * A spec that moves somebody has to do the same, or every later request it makes
 * as that person comes back 401 — including its own cleanup, and including every
 * *other* spec in the run, because the storage state on disk still holds the
 * revoked cookie. That cascade is what turned two institution-move specs into
 * twenty-odd unrelated 401s across the suite. Hence writing the refreshed state
 * back to the file as well as leaving it in the live context.
 *
 * Not a rate-limit risk: the API runs with LOSPOR_DISABLE_RATE_LIMIT for the
 * suite (see playwright.config.ts), and the seeder clears the buckets anyway.
 */
export async function reauthenticate(context: BrowserContext, role: Role): Promise<void> {
  const page = await context.newPage()
  try {
    await signInWithPassword(page, EMAIL_FOR[role])
    // context.request shares this cookie jar, so every later API call in the
    // spec now carries the new session.
    await context.storageState({ path: storageStateFor(role) })
  } finally {
    await page.close()
  }
}
