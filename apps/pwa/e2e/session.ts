import { expect, type APIRequestContext, type Page } from "@playwright/test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// Getting the PWA signed in, without spending login attempts to do it.
//
// The phone app authenticates with a bearer token it keeps in storage, so there
// is no cookie session to save the way the web suite does. The obvious approach
// — drive the login screen in every test — turned out to be the expensive one:
// sign-in is rate limited at 10 per email and 50 per IP address in 15 minutes,
// and a full web + PWA cycle was spending about a dozen. Iterating on a spec
// ended at a login page that would not move, which looks exactly like a broken
// login rather than the limiter doing its job.
//
// So tokens are minted once against the API, cached on disk until they expire,
// and injected into storage. Repeat runs cost nothing. The login *screen* is
// still covered — see the sign-in spec, which uses signInThroughTheScreen.

export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "E2e-Test-Pass!234"

export const API_BASE = (
  process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:3002"
).replace(/\/$/, "")

export const ACCOUNTS = {
  admin:    process.env.E2E_EMAIL          ?? "e2e@lospor.test",
  hodA:     process.env.E2E_HOD_A_EMAIL    ?? "hod-a-e2e@lospor.test",
  memberA:  process.env.E2E_MEMBER_A_EMAIL ?? "member-a-e2e@lospor.test",
  hodB:     process.env.E2E_HOD_B_EMAIL    ?? "hod-b-e2e@lospor.test",
  memberB:  process.env.E2E_MEMBER_B_EMAIL ?? "member-b-e2e@lospor.test",
} as const

export const INSTITUTION_A_NAME = "E2E Test Hospital"
export const INSTITUTION_B_NAME = "E2E Second Hospital"
export const NO_INSTITUTION_NAME = "Без институция"

// src/lib/secure-store-web.ts prefixes every key it puts in localStorage.
const TOKEN_STORAGE_KEY = "lospor_ss_lospor_access_token"
const TOKEN_CACHE_DIR = join(__dirname, ".auth")

/**
 * A synthetic client address for token minting, different on every run.
 *
 * The per-IP limiter exists to stop credential stuffing from one source, and a
 * test suite hammering one address is indistinguishable from that. Rather than
 * weaken the limit, the suite stops sharing a bucket with it — and with the
 * next run. The browser cannot set this header, which is why the login-screen
 * spec still counts against the real address; one login is affordable.
 */
const RUN_ADDRESS = `10.99.${1 + Math.floor(Math.random() * 200)}.${1 + Math.floor(Math.random() * 200)}`

function cachePath(email: string): string {
  return join(TOKEN_CACHE_DIR, `${email.replace(/[^a-z0-9]+/gi, "-")}.token`)
}

/** Seconds until a JWT expires; 0 if it cannot be read. */
function secondsRemaining(token: string): number {
  try {
    const [, payload] = token.split(".")
    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")) as { exp?: number }
    if (typeof claims.exp !== "number") return 0
    return claims.exp - Math.floor(Date.now() / 1000)
  } catch {
    return 0
  }
}

/**
 * A bearer token for `email`, reused across runs while it has life left in it.
 *
 * Deliberately not cached in memory only: the point is that running the suite
 * twice in a row spends no login attempts at all. A cached token stays correct
 * across a reseed because the API resolves role and institution from the
 * database on every request — the token carries identity, not permissions.
 */
export async function tokenFor(request: APIRequestContext, email: string): Promise<string> {
  const file = cachePath(email)
  if (existsSync(file)) {
    const cached = readFileSync(file, "utf8").trim()
    // A minute of headroom so a token cannot expire mid-test.
    if (cached && secondsRemaining(cached) > 60) return cached
  }

  const response = await request.post(`${API_BASE}/v1/auth/token`, {
    headers: { "Content-Type": "application/json", "x-forwarded-for": RUN_ADDRESS },
    data: { email, password: E2E_PASSWORD },
  })
  expect(
    response.status(),
    `could not mint a token for ${email}: ${await response.text()}`,
  ).toBe(200)
  const token = (await response.json()).access_token as string
  expect(token, `no access_token returned for ${email}`).toBeTruthy()

  mkdirSync(TOKEN_CACHE_DIR, { recursive: true })
  writeFileSync(file, token, "utf8")
  return token
}

/**
 * Opens the app already signed in as `email`.
 *
 * The token goes in before any script runs, so the app boots authenticated
 * rather than flashing the login screen and navigating.
 */
export async function signInAs(
  page: Page,
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const token = await tokenFor(request, email)
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key!, value!),
    [TOKEN_STORAGE_KEY, token],
  )
  await page.goto("/")
  await expect(
    page.getByText("New case", { exact: true }),
    `injected a token for ${email} but the app did not consider it signed in`,
  ).toBeVisible()
}

async function attemptScreenSignIn(page: Page, email: string): Promise<void> {
  await page.goto("/")
  await page.getByPlaceholder("you@hospital.org").fill(email)
  await page.locator("input[type=password]").fill(E2E_PASSWORD)
  await page.getByText("Sign in", { exact: true }).click()
  await expect(page.getByText("New case", { exact: true })).toBeVisible()
}

/**
 * The real login screen, for the one spec that is about the login screen.
 *
 * Reaching the dashboard is not the same as staying signed in: the dashboard
 * loads the case list with the new token, and a 401 there logs the clinician
 * straight back out. Carrying on against a signed-out app makes every later
 * step fail for a reason that has nothing to do with what is being tested.
 */
export async function signInThroughTheScreen(page: Page, email: string): Promise<void> {
  await attemptScreenSignIn(page, email)

  const emailField = page.getByPlaceholder("you@hospital.org")
  if (await emailField.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await attemptScreenSignIn(page, email)
  }
  await expect(
    emailField,
    `signed in as ${email} but the app returned to the sign-in screen`,
  ).toHaveCount(0)
}

/**
 * Declares which confirmations and notices a spec expects, accepts those, and
 * fails on anything else.
 *
 * React Native's Alert is a no-op on the web build, so these arrive as
 * window.confirm and window.alert — which Playwright dismisses by default,
 * silently answering "cancel" to every prompt. Accepting everything instead is
 * no better: it swallowed a "Session expired" alert for several runs while the
 * specs carried on against a signed-out app. Expected messages are accepted;
 * an unexpected one is recorded and dismissed, and `assertNoSurprises` fails
 * the test with what it said.
 */
export function expectDialogs(page: Page, expected: RegExp[]): { assertNoSurprises: () => void } {
  const surprises: string[] = []
  page.on("dialog", dialog => {
    const message = dialog.message()
    if (expected.some(pattern => pattern.test(message))) {
      void dialog.accept()
      return
    }
    surprises.push(message)
    // Dismissed rather than accepted: an unexpected confirmation must not be
    // answered "yes" on the way to failing the test.
    void dialog.dismiss()
  })
  return {
    assertNoSurprises() {
      expect(surprises, "the app showed a dialog the spec did not expect").toEqual([])
    },
  }
}

/** Answers every confirmation "cancel", to test the branch that declines. */
export function declineNextDialog(page: Page): { seen: () => string[] } {
  const messages: string[] = []
  page.on("dialog", dialog => {
    messages.push(dialog.message())
    void dialog.dismiss()
  })
  return { seen: () => messages }
}
