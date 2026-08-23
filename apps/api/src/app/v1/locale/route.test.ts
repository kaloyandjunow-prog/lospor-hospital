import { afterEach, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { GET, POST } from "./route"

const originalDefault = process.env.LOSPOR_DEFAULT_LOCALE

afterEach(() => {
  if (originalDefault === undefined) delete process.env.LOSPOR_DEFAULT_LOCALE
  else process.env.LOSPOR_DEFAULT_LOCALE = originalDefault
})

function request(method = "GET", body?: unknown) {
  return new NextRequest("http://localhost/v1/locale", {
    method,
    ...(body === undefined ? {} : {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  })
}

describe("installation and pre-auth locale", () => {
  it("reads a validated installation default without changing account state", async () => {
    process.env.LOSPOR_DEFAULT_LOCALE = "en"
    const response = await GET(request())
    await expect(response.json()).resolves.toEqual({ locale: "en" })
    expect(response.headers.get("set-cookie")).toBeNull()
  })

  it("defaults missing or invalid installation values to Bulgarian", async () => {
    process.env.LOSPOR_DEFAULT_LOCALE = "de"
    await expect((await GET(request())).json()).resolves.toEqual({ locale: "bg" })
    delete process.env.LOSPOR_DEFAULT_LOCALE
    await expect((await GET(request())).json()).resolves.toEqual({ locale: "bg" })
  })

  it("stores an explicit pre-auth selector choice only in the locale cookie", async () => {
    const response = await POST(request("POST", { locale: "en" }))
    await expect(response.json()).resolves.toEqual({ locale: "en" })
    expect(response.headers.get("set-cookie")).toContain("locale=en")
  })

  it.each(["de", "BG", "", null])("rejects unsupported locale %s", async locale => {
    const response = await POST(request("POST", { locale }))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_LOCALE" })
  })
})
