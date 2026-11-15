import { describe, expect, it } from "vitest"
import { dayOfDepartmentYear, departmentYear, izNumberValue, izYearChoiceOpen, izYearFor, suggestIzYear } from "./iz-year"

// 20 January 2027, 10:00 in Sofia.
const JAN_20 = new Date("2027-01-20T08:00:00Z")
const base = { identifier: "43233", at: JAN_20, thisYearHighest: 1200, lastYearHighest: 45000, ehrYears: [] as number[] }

describe("the department's year", () => {
  it("turns at midnight in Sofia, not in UTC", () => {
    // 00:30 on 1 January in Sofia is still 31 December in UTC.
    expect(departmentYear(new Date("2026-12-31T22:30:00Z"))).toBe(2027)
    expect(dayOfDepartmentYear(new Date("2026-12-31T22:30:00Z"))).toBe(0)
  })

  it("keeps the choice open for the first 60 days only", () => {
    expect(izYearChoiceOpen(new Date("2027-03-01T10:00:00Z"))).toBe(true) // day 59
    expect(izYearChoiceOpen(new Date("2027-03-02T10:00:00Z"))).toBe(false) // day 60
    expect(izYearChoiceOpen(new Date("2027-06-01T10:00:00Z"))).toBe(false)
  })
})

describe("the year a case is filed under", () => {
  it("is this year when nothing is said, as before", () => {
    expect(izYearFor(undefined, JAN_20)).toEqual({ ok: true, year: 2027 })
    expect(izYearFor(undefined, new Date("2027-07-01T10:00:00Z"))).toEqual({ ok: true, year: 2027 })
  })

  it("may be last year while the choice is open", () => {
    expect(izYearFor(2026, JAN_20)).toEqual({ ok: true, year: 2026 })
    expect(izYearFor(2026, new Date("2027-07-01T10:00:00Z"))).toEqual({ ok: false })
  })

  it("may be last year in a correction at any time, and never another year", () => {
    expect(izYearFor(2026, new Date("2027-07-01T10:00:00Z"), { correction: true })).toEqual({ ok: true, year: 2026 })
    expect(izYearFor(2025, JAN_20, { correction: true })).toEqual({ ok: false })
    expect(izYearFor(2028, JAN_20)).toEqual({ ok: false })
    expect(izYearFor("x", JAN_20)).toEqual({ ok: false })
  })
})

describe("the suggested year", () => {
  it("is last year for 43233 on 20 January (B)", () => {
    expect(suggestIzYear(base)).toEqual({ open: true, years: [2027, 2026], suggestedYear: 2026, reason: "high-number" })
  })

  it("is this year for a number the hospital reaches by now", () => {
    expect(suggestIzYear({ ...base, identifier: "1450" })).toMatchObject({ suggestedYear: 2027, reason: null })
    // Twice the expected pace still counts as this year: wards admit faster than theatres operate.
    expect(suggestIzYear({ ...base, identifier: "4000" })).toMatchObject({ suggestedYear: 2027 })
  })

  it("guesses nothing without last year's numbers, or past last year's total", () => {
    expect(suggestIzYear({ ...base, lastYearHighest: null })).toMatchObject({ suggestedYear: 2027, reason: null })
    expect(suggestIzYear({ ...base, identifier: "90000" })).toMatchObject({ suggestedYear: 2027 })
    expect(suggestIzYear({ ...base, identifier: "A-17" })).toMatchObject({ suggestedYear: 2027 })
  })

  it("follows an EHR import staged last year, even for a low number (C)", () => {
    expect(suggestIzYear({ ...base, identifier: "120", ehrYears: [2026] })).toMatchObject({ suggestedYear: 2026, reason: "ehr" })
  })

  it("does not let an import that arrived this year outweigh the number", () => {
    // Admitted 28 December, sent on 2 January: stamped with the new year.
    expect(suggestIzYear({ ...base, ehrYears: [2027] })).toMatchObject({ suggestedYear: 2026, reason: "high-number" })
    expect(suggestIzYear({ ...base, identifier: "120", ehrYears: [2027] })).toMatchObject({ suggestedYear: 2027, reason: "ehr" })
  })

  it("is closed after 60 days, whatever the signals", () => {
    expect(suggestIzYear({ ...base, at: new Date("2027-04-01T10:00:00Z"), ehrYears: [2026] }))
      .toEqual({ open: false, years: [2027], suggestedYear: 2027, reason: null })
  })
})

describe("the number's value", () => {
  it("reads the leading digits only", () => {
    expect(izNumberValue("43233")).toBe(43233)
    expect(izNumberValue("0042-A")).toBe(42)
    expect(izNumberValue("A42")).toBeNull()
  })
})
