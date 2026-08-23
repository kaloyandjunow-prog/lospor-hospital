import { describe, expect, it } from "vitest"
import { configuredDefaultLocale, DEFAULT_LOCALE, mergeWithEnglishFallback, messagesForLocale, parseLocale, resolveRequestLocale } from "./locales"
describe("web locales", () => {
  it("defaults to Bulgarian and accepts only shipped locale codes", () => {
    expect(DEFAULT_LOCALE).toBe("bg"); expect(parseLocale("bg")).toBe("bg"); expect(parseLocale("en")).toBe("en"); expect(parseLocale("de")).toBeUndefined()
  })
  it("validates the installer default", () => {
    expect(configuredDefaultLocale("en")).toBe("en"); expect(configuredDefaultLocale("EN")).toBe("bg"); expect(configuredDefaultLocale(undefined)).toBe("bg")
  })
  it("uses account, device, login choice, then configured default", () => {
    expect(resolveRequestLocale({ account: "en", device: "bg", loginChoice: "bg" })).toBe("en")
    expect(resolveRequestLocale({ device: "en", loginChoice: "bg" })).toBe("en")
    expect(resolveRequestLocale({ loginChoice: "en" })).toBe("en")
    expect(resolveRequestLocale({ configuredDefault: "invalid" })).toBe("bg")
  })
  it("recursively falls back to English while retaining both shipped bundles", () => {
    expect(mergeWithEnglishFallback({ nested: { translated: "Преведено" } }, { nested: { translated: "Translated", fallbackOnly: "Fallback" } })).toEqual({ nested: { translated: "Преведено", fallbackOnly: "Fallback" } })
    expect(messagesForLocale("bg").auth).toBeTruthy(); expect(messagesForLocale("en").auth).toBeTruthy()
  })
})
