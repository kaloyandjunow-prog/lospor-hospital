import { describe, expect, it } from "vitest"

import { preopReadyForAllocation } from "./clinical-validation"

const ready = {
  diagnosis: "Cholelithiasis",
  plannedProcedure: "Laparoscopic cholecystectomy",
  asaScore: "II",
  sex: "FEMALE",
  ageYears: 54,
}

describe("preopReadyForAllocation", () => {
  it("accepts a preop carrying all five facts", () => {
    expect(preopReadyForAllocation(ready)).toBe(true)
  })

  it("is false for a missing assessment", () => {
    expect(preopReadyForAllocation(null)).toBe(false)
    expect(preopReadyForAllocation(undefined)).toBe(false)
  })

  // Each of these was required by exactly one client before this was shared,
  // which is the divergence this function exists to end: web asked for a
  // diagnosis and not age or sex, mobile asked for age and sex and not a
  // diagnosis. Dropping any one of them must now fail on both.
  it.each(["diagnosis", "plannedProcedure", "asaScore", "sex"] as const)(
    "is false without %s",
    field => {
      expect(preopReadyForAllocation({ ...ready, [field]: null })).toBe(false)
    },
  )

  it("is false without an age recorded either way", () => {
    expect(preopReadyForAllocation({ ...ready, ageYears: null })).toBe(false)
  })

  it("accepts a precise infant age instead of years", () => {
    expect(preopReadyForAllocation({ ...ready, ageYears: null, ageValue: 6, ageUnit: "MONTHS" })).toBe(true)
  })

  it("rejects a value with no unit, which says nothing on its own", () => {
    expect(preopReadyForAllocation({ ...ready, ageYears: null, ageValue: 6, ageUnit: null })).toBe(false)
  })

  it("treats UNKNOWN sex as not recorded, since it is a truthy string", () => {
    expect(preopReadyForAllocation({ ...ready, sex: "UNKNOWN" })).toBe(false)
  })

  it("accepts the list forms the clients actually store", () => {
    expect(preopReadyForAllocation({
      ...ready,
      diagnosis: null,
      plannedProcedure: null,
      diagnoses: [{ label: "Cholelithiasis" }],
      procedures: [{ label: "Laparoscopic cholecystectomy" }],
    })).toBe(true)
  })

  it("is false when a list is present but empty", () => {
    expect(preopReadyForAllocation({ ...ready, diagnosis: null, diagnoses: [] })).toBe(false)
  })
})
