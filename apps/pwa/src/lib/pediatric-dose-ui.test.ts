import { describe, expect, it } from "vitest"
import type { PediatricDoseProfile } from "@lospor/core/pediatric-dose"
import {
  applicablePediatricDoseProfiles,
  resolvePediatricProfileDose,
} from "./pediatric-dose-ui"

const profile: PediatricDoseProfile = {
  key: "propofol-induction",
  medicationKey: "Propofol",
  indication: "Induction",
  route: "IV",
  minimumAgeDays: 365,
  maximumAgeDaysExclusive: 18 * 365.2425,
  basis: "TBW_KG",
  amountPerUnit: 2,
  maximumAmount: 200,
  roundTo: 1,
  doseUnit: "mg",
  sourceIds: [],
  version: "institution.v1",
  reviewStatus: "APPROVED",
}

describe("pediatric dose UI adapter", () => {
  it("filters profiles by exact pediatric age and canonical medication key", () => {
    expect(applicablePediatricDoseProfiles({
      medicationKey: "Propofol",
      age: { value: 8, unit: "YEARS" },
      profiles: [profile],
    })).toEqual([profile])
    expect(applicablePediatricDoseProfiles({
      medicationKey: "Propofol",
      age: { value: 8, unit: "MONTHS" },
      profiles: [profile],
    })).toEqual([])
  })

  it("calculates a capped institution-approved dose", () => {
    expect(resolvePediatricProfileDose({
      profile,
      age: { value: 12, unit: "YEARS" },
      weightKg: 120,
      heightCm: 170,
    })).toMatchObject({
      status: "AVAILABLE",
      amount: 200,
      doseUnit: "mg",
      profileVersion: "institution.v1",
    })
  })
})
