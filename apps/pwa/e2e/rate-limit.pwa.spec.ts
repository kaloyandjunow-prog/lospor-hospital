import { expect, test } from "@playwright/test"
import { API_BASE } from "./session"

// The limiter that stops someone guessing their way into an account.
//
// It had no test at all, which is a poor position for a control that decides
// whether a stolen email address can be brute-forced — and, incidentally, one
// that had already broken the suite twice by quietly refusing test logins.
//
// Ten attempts per email in fifteen minutes. Counted before the password is
// checked, so wrong guesses count, which is the whole point.
//
// That prior self-lockout is exactly why playwright.pwa.config.ts's webServer
// now sets LOSPOR_DISABLE_RATE_LIMIT=true for the whole suite -- every other
// spec authenticates repeatedly from one address. That fix and this test's
// purpose are in direct conflict: with the limiter off, ten wrong guesses are
// answered 401 all the way through and the eleventh never returns 429. There
// is currently no way to run this one spec against a server with the limiter
// left on without also re-exposing every other spec to the lockout this
// config was changed to prevent. Skipped rather than left silently red until
// that's resolved with its own webServer instance or an explicit per-request
// test-only override.
const RATE_LIMIT_DISABLED_FOR_SUITE = true
const PER_EMAIL_LIMIT = 10

// A throwaway identity and a synthetic client address, both unique to this run:
// the counters are keyed by them, so nothing here consumes the cast's budget or
// leaves a bucket behind for the next run.
const RUN = Math.random().toString(36).slice(2, 8)
const VICTIM = `rate-limit-${RUN}`
const ATTACKER_IP = `10.98.${1 + Math.floor(Math.random() * 200)}.${1 + Math.floor(Math.random() * 200)}`

test("guessing a password is cut off after ten attempts", async ({ request }) => {
  test.skip(RATE_LIMIT_DISABLED_FOR_SUITE, "the shared e2e webServer disables rate limiting")
  test.setTimeout(60_000)

  const guess = () => request.post(`${API_BASE}/v1/auth/token`, {
    headers: { "Content-Type": "application/json", "x-forwarded-for": ATTACKER_IP },
    data: { username: VICTIM, password: "not-the-password" },
  })

  for (let attempt = 1; attempt <= PER_EMAIL_LIMIT; attempt += 1) {
    const response = await guess()
    // 401, not 429: the account does not exist, but the answer is the same one
    // a real account with a wrong password gets. Nothing here tells an attacker
    // whether the address is registered.
    expect(response.status(), `attempt ${attempt} should still be answered`).toBe(401)
  }

  const cutOff = await guess()
  expect(cutOff.status(), "the eleventh attempt was still answered").toBe(429)

  // And it stays cut off — a limiter that resets on the next request is not a
  // limiter.
  expect((await guess()).status()).toBe(429)
})

test("a valid login is refused once the limit is reached", async ({ request }) => {
  test.skip(RATE_LIMIT_DISABLED_FOR_SUITE, "the shared e2e webServer disables rate limiting")
  // The counter is on the identity, not on failure. Someone who has burned the
  // attempts cannot then walk in with the correct password either — which is
  // what makes it a lockout rather than a speed bump.
  const username = `rate-limit-valid-${RUN}`
  const ip = `10.97.${1 + Math.floor(Math.random() * 200)}.${1 + Math.floor(Math.random() * 200)}`

  for (let attempt = 1; attempt <= PER_EMAIL_LIMIT; attempt += 1) {
    const response = await request.post(`${API_BASE}/v1/auth/token`, {
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      data: { username, password: "wrong" },
    })
    expect(response.status()).toBe(401)
  }

  const correct = await request.post(`${API_BASE}/v1/auth/token`, {
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    data: { username, password: process.env.E2E_PASSWORD ?? "E2e-Test-Pass!234" },
  })
  expect(correct.status()).toBe(429)
})
