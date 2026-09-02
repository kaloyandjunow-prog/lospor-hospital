import { describe, expect, it } from "vitest"

import {
  ageFromEgn,
  ageOn,
  collapseReportedAge,
  egnBirthDate,
  ehrAgeProposal,
  isValidEgnChecksum,
} from "./ehr-age"

// ЕГН fixtures, each computed from the published check-digit rule rather than
// copied from anywhere. None belongs to a real person: every one carries the
// sequence 000, and the checksum is what makes them well-formed.
const EGN_1980_01_01 = "8001010008"
const EGN_2000_05_15 = "0045150002"
const EGN_1885_03_07 = "8523070009"
const EGN_2026_08_20 = "2648200000"
const EGN_2025_03_10 = "2543100004"
const EGN_2024_01_15 = "2441150002"
const EGN_2021_10_01 = "2150010002"

const TODAY = new Date("2026-09-02T09:00:00Z")

describe("the century hides in the month digits", () => {
  // The part that catches people out, and the one with teeth: a paediatric
  // patient today is always in the 41–52 range, so reading it as 01–12 does not
  // produce a slightly odd age. It produces an adult, in a case that should be
  // in paediatric mode.

  it("reads 01–12 as the 1900s", () => {
    expect(egnBirthDate(EGN_1980_01_01)?.toISOString().slice(0, 10)).toBe("1980-01-01")
  })

  it("reads 41–52 as the 2000s", () => {
    expect(egnBirthDate(EGN_2000_05_15)?.toISOString().slice(0, 10)).toBe("2000-05-15")
  })

  it("reads 215001… as 1 October 2021", () => {
    // A worked example from the clinician: 50 is October once the +40 is taken
    // off. Kept as its own case because it is a real-world vector rather than
    // one derived from the same rule the code implements — if the offset were
    // ever changed, this is the test that would read as obviously wrong.
    expect(egnBirthDate(EGN_2021_10_01)?.toISOString().slice(0, 10)).toBe("2021-10-01")
  })

  it("reads 21–32 as the 1800s", () => {
    expect(egnBirthDate(EGN_1885_03_07)?.toISOString().slice(0, 10)).toBe("1885-03-07")
  })

  it("makes a child a child, not an adult", () => {
    // The failure the offset exists to prevent, stated as the outcome that
    // matters rather than as a parsed date.
    expect(ageFromEgn(EGN_2024_01_15, TODAY)).toEqual({ value: 2, unit: "YEARS" })
  })
})

describe("a mistyped ЕГН is refused, not guessed", () => {
  // An age decides the clinical mode, the dosing model and the equipment
  // sizing, so a wrong one is worse than none.

  it("rejects a bad check digit", () => {
    expect(isValidEgnChecksum("8001010009")).toBe(false)
    expect(egnBirthDate("8001010009")).toBeNull()
  })

  it("accepts the correct check digit", () => {
    expect(isValidEgnChecksum(EGN_1980_01_01)).toBe(true)
  })

  it("rejects a month outside every century range", () => {
    expect(egnBirthDate("8033010009")).toBeNull()
  })

  it("rejects a date that does not exist", () => {
    // new Date rolls 31 February over to March rather than failing, so the
    // only way to catch one is to read the date back.
    const thirtyFirstOfFebruary = "8002310000"
    expect(egnBirthDate(thirtyFirstOfFebruary)).toBeNull()
  })

  it("rejects anything that is not ten digits", () => {
    for (const bad of ["", "800101", "80010100081", "80010100O8", "  "]) {
      expect(egnBirthDate(bad), bad).toBeNull()
    }
  })

  it("tolerates surrounding whitespace", () => {
    expect(egnBirthDate(` ${EGN_1980_01_01} `)).not.toBeNull()
  })
})

describe("the unit follows the clinical bands, not convenience", () => {
  it("counts a neonate in days", () => {
    expect(ageFromEgn(EGN_2026_08_20, TODAY)).toEqual({ value: 13, unit: "DAYS" })
  })

  it("counts an infant in months", () => {
    expect(ageFromEgn(EGN_2025_03_10, TODAY)).toEqual({ value: 17, unit: "MONTHS" })
  })

  it("switches from days to months at 28 days", () => {
    const birth = new Date("2026-08-05T00:00:00Z")
    expect(ageOn(birth, new Date("2026-09-01T00:00:00Z"))).toEqual({ value: 27, unit: "DAYS" })
    expect(ageOn(birth, new Date("2026-09-02T00:00:00Z"))).toEqual({ value: 0, unit: "MONTHS" })
  })

  it("switches from months to years at two", () => {
    const birth = new Date("2024-09-02T00:00:00Z")
    expect(ageOn(birth, new Date("2026-09-01T00:00:00Z"))).toEqual({ value: 23, unit: "MONTHS" })
    expect(ageOn(birth, new Date("2026-09-02T00:00:00Z"))).toEqual({ value: 2, unit: "YEARS" })
  })
})

describe("a birthday is a birthday", () => {
  // Calendar arithmetic, not division by an average year — because 18 is the
  // boundary the clinical mode check sits on and nobody may cross it early.

  it("is still 17 the day before the eighteenth birthday", () => {
    expect(ageOn(new Date("2008-09-03T00:00:00Z"), TODAY))
      .toEqual({ value: 17, unit: "YEARS" })
  })

  it("is 18 on the day itself", () => {
    expect(ageOn(new Date("2008-09-02T00:00:00Z"), TODAY))
      .toEqual({ value: 18, unit: "YEARS" })
  })

  it("handles a 29 February birthday without inventing a day", () => {
    expect(ageOn(new Date("2024-02-29T00:00:00Z"), new Date("2026-02-28T00:00:00Z")))
      .toEqual({ value: 23, unit: "MONTHS" })
  })

  it("refuses a birth date in the future rather than returning a negative age", () => {
    expect(ageOn(new Date("2027-01-01T00:00:00Z"), TODAY)).toBeNull()
  })
})

describe("years, months and days collapse to one value", () => {
  // Bulgarian hospital systems usually send all three; the record keeps one
  // value and a unit, so somebody has to decide which. Doing it once here is
  // what stops the three transports each deciding differently.

  it("sums the parts rather than taking the largest", () => {
    // "1 year 8 months" is 20 months. Rounding it to 1 year throws away the
    // part that carries the most clinical weight at that age.
    expect(collapseReportedAge({ years: 1, months: 8 })).toEqual({ value: 20, unit: "MONTHS" })
  })

  it("keeps a newborn in days", () => {
    expect(collapseReportedAge({ years: 0, months: 0, days: 6 }))
      .toEqual({ value: 6, unit: "DAYS" })
  })

  it("uses years once past two", () => {
    expect(collapseReportedAge({ years: 7, months: 2 })).toEqual({ value: 7, unit: "YEARS" })
  })

  it("treats a bare year count as years", () => {
    expect(collapseReportedAge({ years: 40 })).toEqual({ value: 40, unit: "YEARS" })
  })

  it("returns nothing when the hospital said nothing", () => {
    expect(collapseReportedAge({})).toBeNull()
    expect(collapseReportedAge({ years: null, months: null, days: null })).toBeNull()
  })

  it("ignores a nonsensical part rather than arithmetic on it", () => {
    expect(collapseReportedAge({ years: -3 })).toBeNull()
  })
})

describe("a date of birth beats a reported age", () => {
  // A transmitted age is stale from the instant it is written. A worklist entry
  // generated three weeks ago saying "5 days old" describes a neonate who is
  // now approaching a month — and the dosing, the equipment and the
  // neonate/infant boundary have all moved underneath it.

  it("prefers the ЕГН when both are present", () => {
    const proposal = ehrAgeProposal({
      egn: EGN_2026_08_20,
      days: 5,
      asOf: TODAY,
    })

    expect(proposal).toEqual({ ageValue: 13, ageUnit: "DAYS", source: "egn" })
  })

  it("falls back to the reported age when there is no ЕГН", () => {
    expect(ehrAgeProposal({ years: 1, months: 8, asOf: TODAY }))
      .toEqual({ ageValue: 20, ageUnit: "MONTHS", source: "reported" })
  })

  it("falls back when the ЕГН is unusable rather than trusting it", () => {
    expect(ehrAgeProposal({ egn: "not-an-egn", years: 40, asOf: TODAY }))
      .toEqual({ ageValue: 40, ageUnit: "YEARS", source: "reported" })
  })

  it("says so when the hospital could supply neither", () => {
    expect(ehrAgeProposal({ asOf: TODAY })).toBeNull()
  })

  it("names its source, so the review can say where the age came from", () => {
    expect(ehrAgeProposal({ egn: EGN_1980_01_01, asOf: TODAY })?.source).toBe("egn")
  })
})
