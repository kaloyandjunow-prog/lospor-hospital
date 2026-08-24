import { describe, expect, it } from "vitest"
import {
  configuredDefaultLocale,
  DEFAULT_LOCALE,
  mergeWithEnglishFallback,
  messagesForLocale,
  parseLocale,
  pwaManifestCopyForLocale,
  resolveRequestLocale,
} from "./locales"

describe("web locales", () => {
  it("defaults to Bulgarian and accepts only shipped locale codes", () => {
    expect(DEFAULT_LOCALE).toBe("bg")
    expect(parseLocale("bg")).toBe("bg")
    expect(parseLocale("en")).toBe("en")
    expect(parseLocale("de")).toBeUndefined()
  })

  it("validates the installer default and falls back to Bulgarian", () => {
    expect(configuredDefaultLocale("en")).toBe("en")
    expect(configuredDefaultLocale("bg")).toBe("bg")
    expect(configuredDefaultLocale("EN")).toBe("bg")
    expect(configuredDefaultLocale("de")).toBe("bg")
    expect(configuredDefaultLocale(undefined)).toBe("bg")
  })

  it("resolves request sources before the configured unauthenticated default", () => {
    expect(resolveRequestLocale({
      account: "en",
      device: "bg",
      loginChoice: "bg",
      configuredDefault: "bg",
    })).toBe("en")
    expect(resolveRequestLocale({
      device: "en",
      loginChoice: "bg",
      configuredDefault: "bg",
    })).toBe("en")
    expect(resolveRequestLocale({
      loginChoice: "en",
      configuredDefault: "bg",
    })).toBe("en")
    expect(resolveRequestLocale({ configuredDefault: "en" })).toBe("en")
    expect(resolveRequestLocale({ configuredDefault: "invalid" })).toBe("bg")
  })

  it("uses English as a recursive runtime safety fallback", () => {
    const merged = mergeWithEnglishFallback(
      { nested: { translated: "Преведено" } },
      { nested: { translated: "Translated", fallbackOnly: "Fallback" } },
    )
    expect(merged).toEqual({ nested: { translated: "Преведено", fallbackOnly: "Fallback" } })
  })

  it("loads complete exact legal bundles for both shipped languages", () => {
    for (const locale of ["bg", "en"] as const) {
      const messages = messagesForLocale(locale)
      expect(messages.legal).toBeTruthy()
    }
  })

  it("loads localized PWA manifest copy from the shipped bundles", () => {
    expect(pwaManifestCopyForLocale("bg").name).toContain("Периоперативен")
    expect(pwaManifestCopyForLocale("en").name).toContain("Perioperative")
  })
})
