import { describe, expect, it } from "vitest"
import { STATIC_CLINICAL_DISPLAY_TERMS } from "./terms"

/**
 * Integrity of the reviewed clinical vocabulary.
 *
 * These 309 terms are the single source of Bulgarian for every surface — web,
 * mobile, PWA, the research browser and the printed record. The failure mode is
 * not a crash: it is a term added in a hurry with the English pasted into the
 * Bulgarian field, which renders perfectly and reads as finished work to anyone
 * who does not speak Bulgarian. The department this ships to does.
 *
 * The catalogue already distinguishes the two honest cases through `bgSource`:
 * `translated` terms must genuinely be Bulgarian, while `international` covers
 * the ventilator modes and similar names that Bulgarian anaesthetists use in
 * their original form. Every one of these invariants holds with no exceptions
 * today, so any failure is a term someone has just added incorrectly.
 */

const terms = STATIC_CLINICAL_DISPLAY_TERMS
const CYRILLIC = /[Ѐ-ӿ]/

describe("clinical display term catalogue", () => {
  it("is not accidentally empty", () => {
    expect(terms.length).toBeGreaterThan(250)
  })

  it("gives every term both locales", () => {
    const missing = terms.filter(term => !term.label.en?.trim() || !term.label.bg?.trim())
    expect(missing.map(term => `${term.domain}/${term.code}`)).toEqual([])
  })

  it("resolves each domain and code exactly once", () => {
    // A duplicate does not fail: one entry silently shadows the other, so a
    // reviewed translation can be replaced by an unreviewed one and nothing says so.
    const seen = new Map<string, number>()
    for (const term of terms) {
      const key = `${term.domain}/${term.code}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    expect([...seen].filter(([, count]) => count > 1).map(([key]) => key)).toEqual([])
  })

  it("requires real Bulgarian for anything marked translated", () => {
    // This is the one that catches English pasted into the Bulgarian field.
    const suspect = terms
      .filter(term => term.bgSource === "translated")
      .filter(term => !CYRILLIC.test(term.label.bg) || term.label.bg === term.label.en)

    expect(suspect.map(term => `${term.domain}/${term.code}="${term.label.bg}"`)).toEqual([])
  })

  it("classifies a term with identical text as international, not as a translation", () => {
    // This pins the defaulting rule in term(): bgSource falls back to
    // "international" exactly when en === bg. It is deliberately not a check
    // that authors declared it — they do not have to, and the assertion would
    // be tautological if read that way. What it protects is the rule itself,
    // because flipping the default would reclassify the ventilator modes as
    // translations and make the check above fire on all of them at once.
    const sameText = terms.filter(term => term.label.en === term.label.bg)

    expect(sameText.length).toBeGreaterThan(0)
    expect(sameText.every(term => term.bgSource === "international")).toBe(true)
  })

  it("keeps optional text bilingual when it is present at all", () => {
    // A short label or description in one locale only leaves the other surface
    // silently falling back, which reads as a missing translation.
    const partial = terms.filter(term =>
      (term.shortLabel && (!term.shortLabel.en?.trim() || !term.shortLabel.bg?.trim()))
      || (term.description && (!term.description.en?.trim() || !term.description.bg?.trim())))

    expect(partial.map(term => `${term.domain}/${term.code}`)).toEqual([])
  })

  it("ships only reviewed terms", () => {
    const unreviewed = terms.filter(term => term.reviewStatus !== "approved")
    expect(unreviewed.map(term => `${term.domain}/${term.code}`)).toEqual([])
  })

  it("uses trimmed, non-empty codes", () => {
    const malformed = terms.filter(term => !term.code || term.code !== term.code.trim())
    expect(malformed.map(term => `${term.domain}/${term.code}`)).toEqual([])
  })
})
