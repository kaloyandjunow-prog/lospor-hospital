import { describe, expect, it } from "vitest"
import {
  DEFAULT_ACCOUNT_KIND,
  DEFAULT_PREFERRED_LOCALE,
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
