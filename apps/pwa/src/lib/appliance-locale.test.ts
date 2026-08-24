import { describe, expect, it, vi } from "vitest"
import { loadApplianceDefaultLocale } from "./appliance-locale"

describe("unauthenticated appliance locale", () => {
  it.each(["bg", "en"] as const)("accepts the configured %s locale", async locale => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ locale }),
    } as Response))

    await expect(loadApplianceDefaultLocale(fetchImpl)).resolves.toBe(locale)
  })

  it("falls back to Bulgarian while offline", async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError("offline") })
    await expect(loadApplianceDefaultLocale(fetchImpl)).resolves.toBe("bg")
  })

  it.each([
    { ok: false, json: async () => ({ locale: "en" }) },
    { ok: true, json: async () => ({ locale: "de" }) },
    { ok: true, json: async () => { throw new SyntaxError("invalid json") } },
  ])("falls back to Bulgarian for an unavailable or invalid response", async response => {
    const fetchImpl = vi.fn(async () => response as Response)
    await expect(loadApplianceDefaultLocale(fetchImpl)).resolves.toBe("bg")
  })
})
