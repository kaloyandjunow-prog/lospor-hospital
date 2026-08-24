import { describe, expect, it } from "vitest"
import {
  DEFAULT_APP_LANGUAGE,
  formatMessage,
  localeFromAccountPayload,
  normalizeAppLanguage,
} from "./locale"

describe("application locale contract", () => {
  it("uses Bulgarian as the application fallback", () => {
    expect(DEFAULT_APP_LANGUAGE).toBe("bg")
    expect(normalizeAppLanguage("de-DE")).toBeNull()
  })

  it("normalizes only supported Bulgarian and English locale values", () => {
    expect(normalizeAppLanguage("bg-BG")).toBe("bg")
    expect(normalizeAppLanguage("en-GB")).toBe("en")
    expect(normalizeAppLanguage("BG-bg")).toBe("bg")
  })

  it("reads the canonical account preference and rollout convenience", () => {
    expect(localeFromAccountPayload({ preferences: { ui: { locale: "en" } } })).toBe("en")
    expect(localeFromAccountPayload({ preferredLocale: "bg" })).toBe("bg")
    expect(localeFromAccountPayload({
      preferredLocale: "bg",
      preferences: { ui: { locale: "en" } },
    })).toBe("en")
    expect(localeFromAccountPayload({ preferences: { ui: { locale: "fr" } } })).toBeNull()
  })

  it("formats named values without deleting unknown placeholders", () => {
    expect(formatMessage("{count} / {total}", { count: 2 })).toBe("2 / {total}")
  })
})
