import { describe, expect, it } from "vitest"
import { CLINICAL_STRINGS } from "./clinical-strings"
import { STRINGS } from "./strings"
import { ACCOUNT_COUNTRY_LABELS, PROFESSIONAL_TITLE_LABELS } from "./account-options"

// Every UI string must exist in BOTH languages. A key present in one table
// but not the other silently renders the raw key (or English) in the app.
describe("i18n key parity", () => {
  it("CLINICAL_STRINGS en/bg have identical key sets", () => {
    const en = Object.keys(CLINICAL_STRINGS.en).sort()
    const bg = Object.keys(CLINICAL_STRINGS.bg).sort()
    expect(bg).toEqual(en)
  })

  it("base STRINGS en/bg have identical key sets", () => {
    const en = Object.keys(STRINGS.en).sort()
    const bg = Object.keys(STRINGS.bg).sort()
    expect(bg).toEqual(en)
  })

  it("no new key collisions between the base and clinical tables", () => {
    // t() and tc() read separate tables; these three historical duplicates are
    // deliberate contextual variants. Any NEW duplicate is almost certainly a
    // mistake — add the key to exactly one table.
    const KNOWN_OVERLAP = ["back", "loadingCase", "ponvPresent"]
    const base = new Set(Object.keys(STRINGS.en))
    const overlap = Object.keys(CLINICAL_STRINGS.en).filter(k => base.has(k)).sort()
    expect(overlap).toEqual(KNOWN_OVERLAP)
  })

  it.each([
    ["base", STRINGS],
    ["clinical", CLINICAL_STRINGS],
  ] as const)("%s translations never contain empty values", (_name, table) => {
    for (const locale of ["bg", "en"] as const) {
      for (const [key, value] of Object.entries(table[locale])) {
        expect(value, `${locale}.${key}`).not.toHaveLength(0)
      }
    }
  })

  it("account option tables cover both locales exactly", () => {
    expect(Object.keys(ACCOUNT_COUNTRY_LABELS.bg).sort())
      .toEqual(Object.keys(ACCOUNT_COUNTRY_LABELS.en).sort())
    expect(Object.keys(PROFESSIONAL_TITLE_LABELS.bg).sort())
      .toEqual(Object.keys(PROFESSIONAL_TITLE_LABELS.en).sort())
  })

  it("keeps the clinician-approved generic Bulgarian terms release-locked", () => {
    expect(CLINICAL_STRINGS.bg.difficultAirwayHx)
      .toBe("Анамнеза за труден дихателен път")
    expect(CLINICAL_STRINGS.bg.summaryDifficultAirway)
      .toBe("Анамнеза за труден дихателен път")
    expect(CLINICAL_STRINGS.bg.awCuffed).toBe("С маншет")
    expect(CLINICAL_STRINGS.bg.summaryDrugs).toBe("медикаменти")
    expect(STRINGS.bg.chooseFavouriteDrugs).toContain("медикамента")
  })
})
