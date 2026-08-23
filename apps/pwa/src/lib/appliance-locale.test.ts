import { describe, expect, it, vi } from "vitest"
import { loadApplianceDefaultLocale } from "./appliance-locale"
describe("unauthenticated appliance locale", () => {
  it.each(["bg", "en"] as const)("accepts %s", async locale => {
    await expect(loadApplianceDefaultLocale(vi.fn(async () => ({ ok: true, json: async () => ({ locale }) } as Response)))).resolves.toBe(locale)
  })
  it("falls back to Bulgarian offline or for invalid responses", async () => {
    await expect(loadApplianceDefaultLocale(vi.fn(async () => { throw new TypeError("offline") }))).resolves.toBe("bg")
    await expect(loadApplianceDefaultLocale(vi.fn(async () => ({ ok: true, json: async () => ({ locale: "de" }) } as Response)))).resolves.toBe("bg")
  })
})
