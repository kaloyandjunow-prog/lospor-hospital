import { describe, expect, it } from "vitest"
import { DEFAULT_LOCALE, localeFromSessionUser, normalizeLocale, preAuthLocale } from "./locale"
describe("Browser locale policy", () => {
  it("defaults to Bulgarian", () => { expect(DEFAULT_LOCALE).toBe("bg"); expect(normalizeLocale(undefined)).toBe("bg"); expect(normalizeLocale("unsupported")).toBe("bg") })
  it("uses appliance default only without a device choice", () => { expect(preAuthLocale(undefined, "en")).toBe("en"); expect(preAuthLocale("bg", "en")).toBe("bg") })
  it("uses nested account locale before convenience field", () => { expect(localeFromSessionUser({ preferredLocale: "EN", preferences: { ui: { locale: "bg" } } })).toBe("bg"); expect(localeFromSessionUser({ preferredLocale: "EN" })).toBe("en") })
})
