import { describe, expect, it } from "vitest"
import { translations } from "./translations"
import { metadataForLocale } from "./i18n"

describe("Browser translation catalog", () => {
  it("ships the same non-empty keys in Bulgarian and English", () => {
    const englishKeys = Object.keys(translations.en).sort()
    const bulgarianKeys = Object.keys(translations.bg).sort()
    expect(bulgarianKeys).toEqual(englishKeys)

    for (const key of englishKeys) {
      expect(translations.en[key as keyof typeof translations.en].trim()).not.toBe("")
      expect(translations.bg[key as keyof typeof translations.bg].trim()).not.toBe("")
    }
  })

  it("localizes browser metadata from the same catalog", () => {
    expect(metadataForLocale("bg")).toMatchObject({ title: "LOSPOR База данни" })
    expect(metadataForLocale("en")).toMatchObject({ title: "LOSPOR Database" })
  })
})
