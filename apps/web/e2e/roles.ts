import path from "path"
import type { Browser, BrowserContext } from "@playwright/test"

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
