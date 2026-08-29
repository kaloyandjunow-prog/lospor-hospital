import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { isPublicPath } from "./proxy"

describe("public route matching", () => {
  it("allows only exact public paths", () => {
    expect(isPublicPath("/login")).toBe(true)
    expect(isPublicPath("/terms")).toBe(true)
    expect(isPublicPath("/offline")).toBe(true)
    expect(isPublicPath("/login-malicious")).toBe(false)
    expect(isPublicPath("/privacy/archive")).toBe(false)
  })
})

const PHONE =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36"
const DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"

const originalPwaUrl = process.env.MOBILE_PWA_URL
const originalDisable = process.env.E2E_DISABLE_MOBILE_REDIRECT

// MOBILE_PWA_URL is read once at module scope, so each case needs a fresh module.
async function runProxy(pwaUrl: string, url: string, userAgent: string) {
  vi.resetModules()
  process.env.MOBILE_PWA_URL = pwaUrl
  delete process.env.E2E_DISABLE_MOBILE_REDIRECT
  const { default: proxy } = await import("./proxy")
  const request = new NextRequest(
    new Request(url, { headers: { "user-agent": userAgent, cookie: "lospor_session=test" } }),
  )
  return proxy(request)
}

afterEach(() => {
  if (originalPwaUrl === undefined) delete process.env.MOBILE_PWA_URL
  else process.env.MOBILE_PWA_URL = originalPwaUrl
  if (originalDisable === undefined) delete process.env.E2E_DISABLE_MOBILE_REDIRECT
  else process.env.E2E_DISABLE_MOBILE_REDIRECT = originalDisable
  vi.resetModules()
})

describe("handing a phone to the PWA", () => {
  // The Hospital appliance serves the web app and the PWA from one hostname,
  // the PWA under /app. Building the target from the origin alone dropped that
  // path and sent / straight back to /, so a phone bounced until the browser
  // gave up with ERR_TOO_MANY_REDIRECTS.
  it("keeps the configured base path when the PWA shares the web origin", async () => {
    const response = await runProxy("https://clinic.example.org/app", "https://clinic.example.org/", PHONE)
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("https://clinic.example.org/app/")
  })

  it("preserves the query string", async () => {
    const response = await runProxy(
      "https://clinic.example.org/app",
      "https://clinic.example.org/?handover=1",
      PHONE,
    )
    expect(response.headers.get("location")).toBe("https://clinic.example.org/app/?handover=1")
  })

  it("still works when the PWA has an origin of its own", async () => {
    const response = await runProxy("https://pwa.example.org", "https://app.example.org/", PHONE)
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("https://pwa.example.org/")
  })

  it("never redirects a URL to itself", async () => {
    // Same origin and no base path: the only honest answer is to serve the page.
    const response = await runProxy("https://clinic.example.org/", "https://clinic.example.org/", PHONE)
    expect(response.headers.get("location")).toBeNull()
  })

  it("leaves a desktop browser on the web app", async () => {
    const response = await runProxy("https://clinic.example.org/app", "https://clinic.example.org/", DESKTOP)
    expect(response.headers.get("location")).toBeNull()
  })

  // These served the web app's own routes. Redirecting them into the PWA
  // required matching screens to exist there, and /dashboard has none.
  it.each(["/cases", "/cases/abc123", "/dashboard"])(
    "serves %s on the phone instead of redirecting it",
    async pathname => {
      const response = await runProxy(
        "https://clinic.example.org/app",
        `https://clinic.example.org${pathname}`,
        PHONE,
      )
      expect(response.headers.get("location")).toBeNull()
    },
  )
})
