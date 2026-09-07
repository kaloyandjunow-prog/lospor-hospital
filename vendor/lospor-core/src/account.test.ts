import { describe, expect, it } from "vitest"
import {
  DEFAULT_ACCOUNT_KIND,
  DEFAULT_PREFERRED_LOCALE,
  localeFromAccountResponse,
  preferredLocaleFromPreferences,
  preferencesWithPreferredLocale,
} from "./account"

describe("account identity and locale contracts", () => {
  it("defaults new accounts to clinical and UI locale to Bulgarian", () => {
    expect(DEFAULT_ACCOUNT_KIND).toBe("CLINICAL")
    expect(DEFAULT_PREFERRED_LOCALE).toBe("bg")
    expect(preferredLocaleFromPreferences(undefined)).toBe("bg")
    expect(preferredLocaleFromPreferences({ ui: {} })).toBe("bg")
  })

  it("reads and updates preferences.ui.locale without discarding other keys", () => {
    const initial = { theme: "dark", ui: { density: "compact", locale: "en" } }
    expect(preferredLocaleFromPreferences(initial)).toBe("en")
    expect(preferencesWithPreferredLocale(initial, "bg")).toEqual({
      theme: "dark",
      ui: { density: "compact", locale: "bg" },
    })
  })

  it("fails malformed or unsupported stored locales closed to Bulgarian", () => {
    expect(preferredLocaleFromPreferences({ ui: { locale: "de" } })).toBe("bg")
    expect(preferredLocaleFromPreferences({ ui: "en" })).toBe("bg")
  })
})

describe("reading the locale out of an account response", () => {
  it("reads the canonical nested preference before the convenience field", () => {
    expect(localeFromAccountResponse({
      preferredLocale: "en",
      preferences: { ui: { locale: "bg" } },
    })).toBe("bg")
  })

  it("falls back to the convenience field when the nested preference is absent", () => {
    expect(localeFromAccountResponse({ preferredLocale: "bg" })).toBe("bg")
  })

  /**
   * Web unwrapped this and mobile did not, so a `/api/user` response shaped
   * this way silently fell back to the device default on the phone only.
   */
  it("unwraps a { user: {...} } envelope around the payload", () => {
    expect(localeFromAccountResponse({
      user: { preferences: { ui: { locale: "en" } } },
    })).toBe("en")
  })

  it("reads the bare user object when there is no envelope", () => {
    expect(localeFromAccountResponse({ preferences: { ui: { locale: "en" } } })).toBe("en")
  })

  /**
   * Mobile accepted a regional tag and web required the bare code, so the same
   * value read on one client and was rejected on the other.
   */
  it("reads a regional tag as its base language", () => {
    expect(localeFromAccountResponse({ preferredLocale: "bg-BG" })).toBe("bg")
    expect(localeFromAccountResponse({ preferredLocale: "EN_gb" })).toBe("en")
  })

  it("returns undefined rather than guessing at an unusable response", () => {
    expect(localeFromAccountResponse(null)).toBeUndefined()
    expect(localeFromAccountResponse({})).toBeUndefined()
    expect(localeFromAccountResponse({ preferredLocale: "fr" })).toBeUndefined()
    expect(localeFromAccountResponse({ preferences: { ui: { locale: 7 } } })).toBeUndefined()
  })
})
