import { describe, expect, it } from "vitest"
import {
  CDC_CHILD_MEDIAN_STATURE_CM,
  CDC_CHILD_MEDIAN_WEIGHT_KG,
  CDC_INFANT_MEDIAN_LENGTH_CM,
  CDC_INFANT_MEDIAN_WEIGHT_KG,
} from "./cdc-growth-reference"
import {
  calculateDevineIdealBodyWeight,
  calculateMcLarenIdealBodyWeight,
  resolveIdealBodyWeight,
} from "./ideal-body-weight"

function pointAt(
  rows: readonly (readonly [number, number])[],
  ageMonths: number,
): readonly [number, number] {
  const point = rows.find(row => row[0] === ageMonths)
  if (!point) throw new Error(`Missing reference point at ${ageMonths} months`)
  return point
}

describe("ideal body weight", () => {
  it("uses Devine for adults without assigning OTHER to a sex curve", () => {
    expect(calculateDevineIdealBodyWeight({ heightCm: 180, sex: "MALE" })).toMatchObject({
      available: true,
      method: "DEVINE_1974",
      roundedKg: 75,
    })
    expect(calculateDevineIdealBodyWeight({ heightCm: 180, sex: "OTHER" })).toEqual(
      expect.objectContaining({ available: false, reason: "UNSUPPORTED_SEX" }),
    )
  })

  it("maps a child median stature to the matching CDC median weight", () => {
    const [, stature] = pointAt(CDC_CHILD_MEDIAN_STATURE_CM.MALE, 120.5)
    const [, weight] = pointAt(CDC_CHILD_MEDIAN_WEIGHT_KG.MALE, 120.5)
    const result = calculateMcLarenIdealBodyWeight({
      age: { value: 10, unit: "YEARS" },
      heightCm: stature,
      sex: "MALE",
    })
    expect(result).toMatchObject({
      available: true,
      method: "MCLAREN_CDC_2000",
      referenceAgeMonths: 120.5,
      kilograms: weight,
    })
  })

  it("interpolates both height-age and median weight", () => {
    const lowerHeight = pointAt(CDC_CHILD_MEDIAN_STATURE_CM.FEMALE, 100.5)
    const upperHeight = pointAt(CDC_CHILD_MEDIAN_STATURE_CM.FEMALE, 101.5)
    const lowerWeight = pointAt(CDC_CHILD_MEDIAN_WEIGHT_KG.FEMALE, 100.5)
    const upperWeight = pointAt(CDC_CHILD_MEDIAN_WEIGHT_KG.FEMALE, 101.5)
    const result = calculateMcLarenIdealBodyWeight({
      age: { value: 8, unit: "YEARS" },
      heightCm: (lowerHeight[1] + upperHeight[1]) / 2,
      sex: "FEMALE",
    })
    expect(result.available).toBe(true)
    if (result.available) {
      expect(result.referenceAgeMonths).toBeCloseTo(101, 8)
      expect(result.kilograms).toBeCloseTo((lowerWeight[1] + upperWeight[1]) / 2, 8)
    }
  })

  it("uses infant length tables below 24 months and child stature tables at 24 months", () => {
    const infantLength = pointAt(CDC_INFANT_MEDIAN_LENGTH_CM.MALE, 23.5)
    const infantWeight = pointAt(CDC_INFANT_MEDIAN_WEIGHT_KG.MALE, 23.5)
    expect(calculateMcLarenIdealBodyWeight({
      age: { value: 23, unit: "MONTHS" },
      heightCm: infantLength[1],
      sex: "MALE",
    })).toMatchObject({ available: true, kilograms: infantWeight[1], referenceMeasurement: "LENGTH" })

    const childStature = pointAt(CDC_CHILD_MEDIAN_STATURE_CM.MALE, 24)
    const childWeight = pointAt(CDC_CHILD_MEDIAN_WEIGHT_KG.MALE, 24)
    expect(calculateMcLarenIdealBodyWeight({
      age: { value: 24, unit: "MONTHS" },
      heightCm: childStature[1],
      sex: "MALE",
    })).toMatchObject({ available: true, kilograms: childWeight[1], referenceMeasurement: "STATURE" })
  })

  it("does not extrapolate or silently substitute another method", () => {
    expect(calculateMcLarenIdealBodyWeight({
      age: { value: 10, unit: "YEARS" },
      heightCm: 220,
      sex: "MALE",
    })).toEqual(expect.objectContaining({ available: false, reason: "OUTSIDE_REFERENCE_HEIGHT" }))
    expect(resolveIdealBodyWeight({
      clinicalMode: "PEDIATRIC",
      age: { value: 10, unit: "YEARS" },
      heightCm: 140,
      sex: "OTHER",
    })).toEqual(expect.objectContaining({ available: false, method: "MCLAREN_CDC_2000" }))
  })
})

/**
 * The CDC growth reference ends at the median stature for twenty years — about
 * 163 cm for a girl, 176 cm for a boy. A taller adolescent ran off the top of
 * it, McLaren could say nothing, and every dose calculated from ideal body
 * weight silently stopped being suggested for a patient who is otherwise
 * entirely ordinary to anaesthetise.
 *
 * Devine covers exactly that range and the two overlap rather than abut, so the
 * handover happens where McLaren runs out. Nothing else falls through: Devine
 * knows only height and sex, and refuses anything under five feet.
 */
describe("ideal body weight for a grown adolescent", () => {
  const pediatric = (heightCm: number, sex: string, years: number, preterm?: boolean) =>
    resolveIdealBodyWeight({
      clinicalMode: "PEDIATRIC",
      heightCm,
      sex,
      age: { value: years, unit: "YEARS" },
      preterm,
    })

  it("hands over to Devine once the growth reference runs out", () => {
    // 163 cm is the last stature the female reference covers.
    expect(pediatric(163, "FEMALE", 16)).toMatchObject({
      available: true,
      method: "MCLAREN_CDC_2000",
    })
    expect(pediatric(165, "FEMALE", 16)).toMatchObject({
      available: true,
      method: "DEVINE_1974",
    })
    expect(pediatric(180, "MALE", 17)).toMatchObject({
      available: true,
      method: "DEVINE_1974",
    })
  })

  it("records which method produced the number", () => {
    // The record has to show how a dose was arrived at, not just the weight.
    expect(pediatric(180, "MALE", 17)).toMatchObject({
      method: "DEVINE_1974",
      sourceIds: ["DEVINE_1974"],
    })
  })

  it("keeps a small child on the paediatric reference", () => {
    // Devine's own five-foot floor is what keeps children off this path, so a
    // short child gets the paediatric answer or none — never an adult formula.
    expect(pediatric(110, "FEMALE", 5)).toMatchObject({
      available: true,
      method: "MCLAREN_CDC_2000",
    })
    expect(pediatric(45, "FEMALE", 0)).toMatchObject({
      available: false,
      method: "MCLAREN_CDC_2000",
    })
  })

  it("does not fall through for a preterm infant or for missing details", () => {
    // Devine knows nothing about prematurity, age or an unrecorded sex; each
    // must keep its own reason rather than be answered by the wrong method.
    expect(pediatric(40, "MALE", 0, true)).toMatchObject({
      available: false,
      reason: "PRETERM_REFERENCE_REQUIRED",
    })
    expect(resolveIdealBodyWeight({
      clinicalMode: "PEDIATRIC", heightCm: 170, sex: null, age: { value: 16, unit: "YEARS" },
    })).toMatchObject({ available: false, reason: "UNSUPPORTED_SEX" })
    expect(resolveIdealBodyWeight({
      clinicalMode: "PEDIATRIC", heightCm: 170, sex: "MALE", age: null,
    })).toMatchObject({ available: false, reason: "MISSING_AGE" })
  })
})

describe("Devine below its anchor", () => {
  it("answers at five feet exactly, where its constants are defined", () => {
    expect(calculateDevineIdealBodyWeight({ heightCm: 152.4, sex: "FEMALE" }))
      .toMatchObject({ available: true, roundedKg: 45.5 })
    expect(calculateDevineIdealBodyWeight({ heightCm: 152.4, sex: "MALE" }))
      .toMatchObject({ available: true, roundedKg: 50 })
  })

  it("still doses a short adult", () => {
    // 145-152 cm adults are ordinary and the extrapolation there is small.
    // Refusing them would remove dose support from a large, routine group.
    expect(calculateDevineIdealBodyWeight({ heightCm: 150, sex: "FEMALE" }))
      .toMatchObject({ available: true, roundedKg: 43.3 })
    expect(calculateDevineIdealBodyWeight({ heightCm: 145, sex: "FEMALE" }))
      .toMatchObject({ available: true })
  })

  it("refuses where the line has run away from reality", () => {
    // It used to clamp at zero, dressing up a collapsed extrapolation as an
    // answer: 25 kg at 130 cm, 16 kg at 120 cm, and a 63 mg induction dose
    // behind it. Adult height that low is usually disproportionate short
    // stature, where trunk mass is near-normal and Devine understates badly.
    for (const heightCm of [139, 130, 120, 110]) {
      expect(calculateDevineIdealBodyWeight({ heightCm, sex: "FEMALE" })).toMatchObject({
        available: false,
        reason: "OUTSIDE_REFERENCE_HEIGHT",
      })
    }
  })

  it("never returns a zero or negative ideal weight", () => {
    for (let heightCm = 100; heightCm <= 210; heightCm += 0.5) {
      for (const sex of ["MALE", "FEMALE"]) {
        const result = calculateDevineIdealBodyWeight({ heightCm, sex })
        if (result.available) expect(result.kilograms).toBeGreaterThan(0)
      }
    }
  })
})
