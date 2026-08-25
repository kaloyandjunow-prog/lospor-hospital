import { describe, expect, it } from "vitest"
import { preferredLocaleFromPreferences, preferencesWithPreferredLocale } from "./account-locale"

describe("account preferred locale", () => {
  it.each([undefined, null, {}, { ui: {} }, { ui: { locale: "de" } }])(
    "defaults invalid preference %j to Bulgarian",
    preferences => expect(preferredLocaleFromPreferences(preferences)).toBe("bg"),
  )

  it("reads English only when explicitly stored", () => {
    expect(preferredLocaleFromPreferences({ ui: { locale: "en" } })).toBe("en")
  })

  it("updates locale without losing other account or UI preferences", () => {
    expect(preferencesWithPreferredLocale({
      theme: "dark",
      ui: { density: "compact", locale: "bg" },
    }, "en")).toEqual({
      theme: "dark",
      ui: { density: "compact", locale: "en" },
    })
  })
})
