import { describe, expect, it } from "vitest"
import { calcApfel, calcRCRI, calcStopBang } from "./scores"

/**
 * Both clients used to hand-roll this arithmetic themselves instead of
 * calling these functions -- mobile as a `.filter(Boolean).length` over an
 * array assembled by hand, web via its own inline useMemo. Pinning the
 * formulas here is what lets the duplicate copies be deleted with confidence
 * that nothing about the score itself changed.
 */
describe("calcRCRI", () => {
  it("counts each of the six factors once", () => {
    expect(calcRCRI({
      highRiskSurgery: false, ischaemicHeartDisease: false, congestiveHeartFailure: false,
      cerebrovascularDisease: false, insulinDependentDiabetes: false, creatinineHigh: false,
    })).toBe(0)
    expect(calcRCRI({
      highRiskSurgery: true, ischaemicHeartDisease: true, congestiveHeartFailure: true,
      cerebrovascularDisease: true, insulinDependentDiabetes: true, creatinineHigh: true,
    })).toBe(6)
  })
})

describe("calcApfel", () => {
  it("counts each of the four factors once", () => {
    expect(calcApfel({ female: false, nonSmoker: false, ponvHistory: false, opioidsPlanned: false })).toBe(0)
    expect(calcApfel({ female: true, nonSmoker: true, ponvHistory: true, opioidsPlanned: true })).toBe(4)
  })
})

describe("calcStopBang", () => {
  it("counts a high BMI only above 35", () => {
    const base = {
      snoring: false, tired: false, observed: false, highBP: false,
      ageOver50: false, neckOver40cm: false, male: false,
    }
    expect(calcStopBang({ ...base, bmi: 35 })).toBe(0)
    expect(calcStopBang({ ...base, bmi: 35.1 })).toBe(1)
  })

  it("counts each of the eight factors once", () => {
    expect(calcStopBang({
      snoring: true, tired: true, observed: true, highBP: true,
      bmi: 40, ageOver50: true, neckOver40cm: true, male: true,
    })).toBe(8)
  })
})
