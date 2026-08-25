import { afterEach, describe, expect, it } from "vitest"
import { AuthService } from "./auth.js"
import { createStatusApp } from "./app.js"
import type { StatusConfig } from "./config.js"
import { StatusDatabase } from "./db.js"
import { totpCode } from "./mfa.js"

const databases: StatusDatabase[] = []
afterEach(() => {
  while (databases.length) databases.pop()?.close()
})

function setup(defaultLocale: "bg" | "en" = "en") {
  const now = Date.parse("2026-08-12T12:00:00.000Z")
  const db = new StatusDatabase(":memory:")
  databases.push(db)
  const config = {
    defaultLocale,
    basePath: "/status",
    eventTokens: new Map([
      ["api", "a".repeat(24)],
      ["api-previous", "p".repeat(24)],
    ]),
  } as unknown as StatusConfig
  const auth = new AuthService(db, Buffer.alloc(32, 7), 4, () => now)
  return { db, auth, app: createStatusApp({ db, auth, config, now: () => now }), now }
}

function originHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    origin: "https://hospital.test",
    host: "hospital.test",
    "x-forwarded-proto": "https",
    ...extra,
  }
}

async function passwordLogin(
  app: ReturnType<typeof setup>["app"],
  now: number,
  loginUrl = "/status/login",
  mfaUrl = "/status/login/mfa",
  headers = originHeaders({ "content-type": "application/x-www-form-urlencoded" }),
) {
  const challengeResponse = await app.request(loginUrl, {
    method: "POST",
    headers,
    body: new URLSearchParams({
      email: "admin@hospital.test",
      password: "Initial password phrase1!",
    }),
  })
  const challengePage = await challengeResponse.text()
  const challengeToken = challengePage.match(/name="challengeToken" value="([^"]+)"/)?.[1]
  const manualKey = challengePage.match(/<div class="secret">([A-Z2-7]+)<\/div>/)?.[1]
  if (!challengeToken || !manualKey) throw new Error("MFA enrollment page was incomplete")
  const response = await app.request(mfaUrl, {
    method: "POST",
    headers,
    body: new URLSearchParams({
      challengeToken,
      code: totpCode(manualKey, now),
    }),
  })
  return { challengeResponse, challengePage, response }
}

describe("status HTTP boundary", () => {
  it("defaults the complete login screen to Bulgarian and keeps English obvious", async () => {
    const { app } = setup("bg")
    const response = await app.request("/status/login")
    const body = await response.text()
    expect(body).toContain('<html lang="bg">')
    expect(body).toContain("Имейл на системния администратор")
    expect(body).toContain('name="locale" value="en"')
    expect(body).not.toContain("Appliance administrator email")
  })

  it("stores an explicit language choice without accepting an open redirect", async () => {
    const { app } = setup("bg")
    const response = await app.request("/status/language", {
      method: "POST",
      headers: originHeaders({ "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ locale: "en", returnTo: "https://elsewhere.test/" }),
    })
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("/status/")
    expect(response.headers.get("set-cookie")).toMatch(/lospor_status_locale=en;.*HttpOnly.*Secure.*SameSite=Strict/i)

    const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? ""
    const english = await app.request("/status/login", { headers: { cookie } })
    expect(await english.text()).toContain("Appliance administrator email")
  })

  it("keeps liveness private and does not disclose database details", async () => {
    const { app } = setup()
    const response = await app.request("/internal/health/live")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ schemaVersion: 1, status: "ok" })
    expect(response.headers.get("cache-control")).toContain("no-store")
  })

  it("requires an independent session for state", async () => {
    const { app } = setup()
    const page = await app.request("/status/")
    expect(page.status).toBe(200)
    expect(await page.text()).toContain("Appliance administrator email")
    expect((await app.request("/status/api/state")).status).toBe(401)
  })

  it("provides the documented login URL", async () => {
    const { app } = setup()
    const response = await app.request("/status/login")
    expect(response.status).toBe(200)
    expect(await response.text()).toContain("Appliance administrator email")
  })

  it("sets hardened cookies and accepts a valid login", async () => {
    const { app, auth, now } = setup()
    await auth.initialize("admin@hospital.test", "Initial password phrase1!")
    const { challengeResponse, response } = await passwordLogin(app, now)
    expect(challengeResponse.status).toBe(200)
    expect(challengeResponse.headers.get("set-cookie")).toBeNull()
    expect(response.status).toBe(200)
    expect(await response.text()).toContain("Save your recovery codes now")
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly.*Secure.*SameSite=Strict/i)
  })

  it("keeps the MFA setup screen Bulgarian by default and switches it to English without losing the challenge", async () => {
    const { app, auth } = setup("bg")
    await auth.initialize("admin@hospital.test", "Initial password phrase1!")
    const begin = await app.request("/status/login", {
      method: "POST",
      headers: originHeaders({ "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({
        email: "admin@hospital.test",
        password: "Initial password phrase1!",
      }),
    })
    const bulgarian = await begin.text()
    const challengeToken = bulgarian.match(/name="challengeToken" value="([^"]+)"/)?.[1] ?? ""
    expect(bulgarian).toContain("Настройване на потвърждение в две стъпки")
    expect(bulgarian).toContain("Ключ за ръчна настройка")
    expect(begin.headers.get("set-cookie")).toBeNull()

    const switched = await app.request("/status/login/mfa", {
      method: "POST",
      headers: originHeaders({ "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ challengeToken, locale: "en" }),
    })
    const english = await switched.text()
    expect(switched.status).toBe(200)
    expect(switched.headers.get("set-cookie")).toMatch(/lospor_status_locale=en/)
    expect(english).toContain("Set up two-step verification")
    expect(english).toContain(`name="challengeToken" value="${challengeToken}"`)
  })

  it("does not set a session for a wrong MFA code and allows the same challenge to be corrected", async () => {
    const { app, auth, now } = setup()
    await auth.initialize("admin@hospital.test", "Initial password phrase1!")
    const begin = await app.request("/status/login", {
      method: "POST",
      headers: originHeaders({ "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({
        email: "admin@hospital.test",
        password: "Initial password phrase1!",
      }),
    })
    const page = await begin.text()
    const challengeToken = page.match(/name="challengeToken" value="([^"]+)"/)?.[1] ?? ""
    const manualKey = page.match(/<div class="secret">([A-Z2-7]+)<\/div>/)?.[1] ?? ""
    const rejected = await app.request("/status/login/mfa", {
      method: "POST",
      headers: originHeaders({ "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ challengeToken, code: "invalid" }),
    })
    expect(rejected.status).toBe(401)
    expect(rejected.headers.get("set-cookie")).toBeNull()
    expect(await rejected.text()).toContain("The verification code was not accepted")

    const accepted = await app.request("/status/login/mfa", {
      method: "POST",
      headers: originHeaders({ "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ challengeToken, code: totpCode(manualKey, now) }),
    })
    expect(accepted.status).toBe(200)
    expect(accepted.headers.get("set-cookie")).toMatch(/lospor_status_session=/)
    expect((await accepted.text()).match(/[A-Z2-7]{4}(?:-[A-Z2-7]{4}){3}/g)).toHaveLength(10)
  })

  it("allows the loopback HTTP development harness to retain its session", async () => {
    const { app, auth, now } = setup()
    await auth.initialize("admin@hospital.test", "Initial password phrase1!")
    const headers = {
      origin: "http://127.0.0.1:13004",
      host: "127.0.0.1:13004",
      "content-type": "application/x-www-form-urlencoded",
    }
    const { response } = await passwordLogin(
      app,
      now,
      "http://127.0.0.1:13004/status/login",
      "http://127.0.0.1:13004/status/login/mfa",
      headers,
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly.*SameSite=Strict/i)
    expect(response.headers.get("set-cookie")).not.toMatch(/; Secure/i)
  })

  it("accepts Chromium's opaque origin only on the direct HTTPS loopback fallback", async () => {
    const { app, auth, now } = setup()
    await auth.initialize("admin@hospital.test", "Initial password phrase1!")
    const headers = {
      origin: "null",
      host: "localhost:3443",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "navigate",
      "content-type": "application/x-www-form-urlencoded",
    }
    const { response } = await passwordLogin(
      app,
      now,
      "https://localhost:3443/status/login",
      "https://localhost:3443/status/login/mfa",
      headers,
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly.*Secure.*SameSite=Strict/i)
  })

  it.each([
    ["non-loopback host", "https://hospital.test/status/login", { host: "hospital.test", "sec-fetch-site": "same-origin", "sec-fetch-mode": "navigate" }],
    ["plain HTTP", "http://localhost:3443/status/login", { host: "localhost:3443", "sec-fetch-site": "same-origin", "sec-fetch-mode": "navigate" }],
    ["cross-site navigation", "https://localhost:3443/status/login", { host: "localhost:3443", "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" }],
    ["forwarded request", "https://localhost:3443/status/login", { host: "localhost:3443", "sec-fetch-site": "same-origin", "sec-fetch-mode": "navigate", "x-forwarded-proto": "https" }],
  ])("rejects an opaque origin for %s", async (_label, url, headers) => {
    const { app } = setup()
    const response = await app.request(url, {
      method: "POST",
      headers: { origin: "null", "content-type": "application/x-www-form-urlencoded", ...headers },
      body: new URLSearchParams({ email: "admin@hospital.test", password: "Initial password phrase1!" }),
    })
    expect(response.status).toBe(403)
  })

  it("rejects cross-origin login and logout posts", async () => {
    const { app } = setup()
    expect((await app.request("/status/login", { method: "POST" })).status).toBe(403)
    expect((await app.request("/status/login/mfa", { method: "POST" })).status).toBe(403)
    expect((await app.request("/status/logout", { method: "POST" })).status).toBe(403)
  })

  it("authenticates producers, validates schema and deduplicates event IDs", async () => {
    const { app, db, now } = setup()
    const event = {
      eventId: "8cb77871-2875-4332-94e1-728bb7b3871b",
      occurredAt: new Date(now).toISOString(),
      code: "AUDIT_WRITE_FAILED",
      facts: {},
    }
    expect((await app.request("/internal/events", {
      method: "POST",
      headers: { authorization: `Bearer ${"x".repeat(24)}`, "content-type": "application/json" },
      body: JSON.stringify(event),
    })).status).toBe(401)
    const accepted = await app.request("/internal/events", {
      method: "POST",
      headers: { authorization: `Bearer ${"a".repeat(24)}`, "content-type": "application/json" },
      body: JSON.stringify(event),
    })
    expect(accepted.status).toBe(202)
    expect(await accepted.json()).toEqual({ accepted: true, duplicate: false })
    const duplicate = await app.request("/internal/events", {
      method: "POST",
      headers: { authorization: `Bearer ${"a".repeat(24)}`, "content-type": "application/json" },
      body: JSON.stringify(event),
    })
    expect(await duplicate.json()).toEqual({ accepted: true, duplicate: true })

    const previousCredentialEvent = {
      ...event,
      eventId: "9cb77871-2875-4332-94e1-728bb7b3871b",
    }
    const acceptedDuringOverlap = await app.request("/internal/events", {
      method: "POST",
      headers: { authorization: `Bearer ${"p".repeat(24)}`, "content-type": "application/json" },
      body: JSON.stringify(previousCredentialEvent),
    })
    expect(acceptedDuringOverlap.status).toBe(202)
    expect(db.getDashboard(now).events.find(item => item.id === previousCredentialEvent.eventId)?.producer)
      .toBe("api")
  })

  it("rejects arbitrary event facts before persistence or rendering", async () => {
    const { app, db, now } = setup()
    const response = await app.request("/internal/events", {
      method: "POST",
      headers: { authorization: `Bearer ${"a".repeat(24)}`, "content-type": "application/json" },
      body: JSON.stringify({
        eventId: "8cb77871-2875-4332-94e1-728bb7b3871b",
        occurredAt: new Date(now).toISOString(),
        code: "AUDIT_WRITE_FAILED",
        facts: { patientId: "must-not-cross-boundary" },
      }),
    })
    expect(response.status).toBe(400)
    expect(db.getDashboard(now).events).toHaveLength(0)
  })

  it("does not acknowledge an event when durable storage is unavailable", async () => {
    const { app, db, now } = setup()
    db.sqlite.exec("DROP TABLE operational_events")
    const response = await app.request("/internal/events", {
      method: "POST",
      headers: { authorization: `Bearer ${"a".repeat(24)}`, "content-type": "application/json" },
      body: JSON.stringify({
        eventId: "8cb77871-2875-4332-94e1-728bb7b3871b",
        occurredAt: new Date(now).toISOString(),
        code: "AUDIT_WRITE_FAILED",
        facts: {},
      }),
    })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: "Event storage unavailable",
      code: "EVENT_STORAGE_UNAVAILABLE",
    })
  })
})
