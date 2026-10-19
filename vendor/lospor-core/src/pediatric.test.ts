import { describe, expect, it } from "vitest"
import {
  APAGBI_FASTING_POLICY_2023,
  calculateColds,
  calculatePovoc,
  classifyPediatricVital,
  fastingDeadline,
  isFastingAssignmentBelowMinimum,
  policyFastingAssignments,
  getPediatricVitalReference,
  normalizePediatricAge,
  pediatricAgeToApproximateDays,
  recommendPediatricPainScale,
  requiresPediatricModeDecision,
  validateClinicalModeAge,
  fastingClockTimes
} from "./pediatric"
import {
  calculateMostellerBsa,
  calculatePediatricBloodVolume,
  calculatePediatricMaintenanceFluid,
  calculatePediatricLocalAnaestheticLimit,
  calculateRcukPediatricResuscitation,
  pediatricIntraopReference,
} from "./pediatric-calculators"
import {
  resolvePediatricDoseSuggestion,
  type PediatricDoseProfile,
} from "./pediatric-dose"

describe("pediatric age and mode", () => {
  it("normalizes precise pediatric ages without requiring date of birth", () => {
    expect(normalizePediatricAge({ value: 10, unit: "DAYS" })).toMatchObject({
      approximateDays: 10,
      completedYears: 0,
      ageGroup: "NEONATE",
    })
    expect(normalizePediatricAge({ value: 17, unit: "YEARS" })?.ageGroup).toBe("ADOLESCENT")
    expect(normalizePediatricAge({ value: 18, unit: "YEARS" })).toBeNull()
    expect(pediatricAgeToApproximateDays(6, "MONTHS")).toBeCloseTo(182.62125)
    expect(pediatricAgeToApproximateDays(20, "DAYS")).toBe(20)
  })

  it("requires pediatric mode below 18", () => {
    expect(validateClinicalModeAge("ADULT", { value: 17, unit: "YEARS" })).toEqual({
      valid: false,
      code: "PEDIATRIC_MODE_REQUIRED",
    })
    expect(requiresPediatricModeDecision({ ageYears: 4, clinicalMode: "ADULT" })).toBe(true)
  })})

describe("pediatric reference rules", () => {
  it("interpolates RCUK vital references and classifies them softly", () => {
    expect(getPediatricVitalReference({ value: 1, unit: "YEARS" })).toMatchObject({
      respiratoryRate: { lower: 20, upper: 50 },
      heartRate: { lower: 100, upper: 170 },
      systolicBp: { p5: 70, p10: 75, p50: 95 },
    })
    expect(classifyPediatricVital("SYSTOLIC_BP", 60, { value: 1, unit: "YEARS" })).toBe("BELOW_P5")
    expect(classifyPediatricVital("HEART_RATE", 120, { value: 1, unit: "YEARS" })).toBe("WITHIN_REFERENCE")
  })

  it("calculates POVOC and advisory COLDS scores", () => {
    expect(calculatePovoc({
      ageYears: 5,
      surgeryMinutes: 60,
      strabismusSurgery: false,
      patientOrFamilyHistory: true,
    })).toMatchObject({ score: 3, riskPercent: 55 })
    expect(calculateColds({
      currentSymptoms: "MILD",
      onset: "LESS_THAN_2_WEEKS",
      lungDisease: "NONE",
      airwayDevice: "TRACHEAL_TUBE",
      surgery: "NON_AIRWAY",
    })).toMatchObject({ score: 14, advisoryOnly: true })
  })

  it("selects pain scales by ability", () => {
    expect(recommendPediatricPainScale({ ageYears: 2, canSelfReport: false }).scale).toBe("FLACC")
    expect(recommendPediatricPainScale({ ageYears: 5, canSelfReport: true }).scale).toBe("FPS_R")
  })

  // Nil-by-mouth is an instruction in hours before surgery, not a last-intake
  // time judged against the moment of the preop visit.
  it("assigns fasting in hours before surgery, starting from APAGBI 2023", () => {
    expect(policyFastingAssignments(APAGBI_FASTING_POLICY_2023).map(row => [row.category, row.hoursBefore])).toEqual([
      ["CLEAR_FLUIDS", 1], ["BREAST_MILK", 3], ["INFANT_FORMULA_UNDER_1_YEAR", 4], ["SOLID_FOOD_OR_COW_MILK", 6],
    ])
    expect(isFastingAssignmentBelowMinimum({ category: "SOLID_FOOD_OR_COW_MILK", hoursBefore: 4 })).toBe(true)
    expect(isFastingAssignmentBelowMinimum({ category: "CLEAR_FLUIDS", hoursBefore: 2 })).toBe(false)
  })

  it("turns an assignment into a clock time once surgery has started", () => {
    expect(fastingDeadline("2026-10-16T08:30:00Z", 6)?.toISOString()).toBe("2026-10-16T02:30:00.000Z")
    expect(fastingDeadline("not a date", 6)).toBeNull()
  })
})

describe("pediatric calculators", () => {
  it("calculates BSA, maintenance fluid and resuscitation values from cited rules", () => {
    expect(calculateMostellerBsa({ heightCm: 100, weightKg: 20 })).toMatchObject({
      available: true,
      value: { squareMetres: 0.7454 },
    })
    expect(calculatePediatricMaintenanceFluid({ weightKg: 25 })).toMatchObject({
      available: true,
      value: { dailyMl: 1600, method: "HOLLIDAY_SEGAR" },
    })
    expect(calculatePediatricMaintenanceFluid({
      weightKg: 3,
      age: { value: 3, unit: "DAYS" },
    })).toMatchObject({
      available: true,
      value: { dailyRangeMl: { minimum: 240, maximum: 300 } },
    })
    expect(calculateRcukPediatricResuscitation({ weightKg: 40 })).toMatchObject({
      available: true,
      value: {
        shockJoules: 160,
        escalatedShockJoules: 320,
        adrenalineMicrograms: 400,
        amiodaroneFirstDoseMilligrams: 200,
        amiodaroneSecondDoseMilligrams: 150,
      },
    })
  })

  it("withholds blood-volume and local-anaesthetic calculations without reviewed profiles", () => {
    expect(calculatePediatricBloodVolume({ weightKg: 20 })).toMatchObject({
      available: false,
      reason: "REVIEWED_PROFILE_REQUIRED",
    })
    expect(calculatePediatricLocalAnaestheticLimit({ weightKg: 20 })).toMatchObject({
      available: false,
      reason: "REVIEWED_PROFILE_REQUIRED",
    })
  })
})

describe("pediatric dose profiles", () => {
  const profile: PediatricDoseProfile = {
    key: "test-drug-induction-iv-v1",
    medicationKey: "test-drug",
    indication: "INDUCTION",
    route: "IV",
    minimumAgeDays: 365,
    maximumAgeDaysExclusive: 18 * 365.2425,
    basis: "TBW_KG",
    amountPerUnit: 2,
    maximumAmount: 100,
    roundTo: 1,
    doseUnit: "mg",
    sourceIds: ["TEST_SOURCE"],
    version: "1",
    reviewStatus: "APPROVED",
  }

  it("uses only an approved profile matching age, indication and route", () => {
    expect(resolvePediatricDoseSuggestion({
      medicationKey: "test-drug",
      indication: "INDUCTION",
      route: "IV",
      age: { value: 10, unit: "YEARS" },
      totalBodyWeightKg: 60,
    }, [profile])).toMatchObject({
      status: "AVAILABLE",
      amount: 100,
      profileKey: profile.key,
    })
    expect(resolvePediatricDoseSuggestion({
      medicationKey: "test-drug",
      indication: "ANALGESIA",
      route: "IV",
      age: { value: 10, unit: "YEARS" },
      totalBodyWeightKg: 60,
    }, [profile])).toEqual({
      status: "NO_REVIEWED_PROFILE",
      manualDocumentationAllowed: true,
    })
  })

})

describe("the paediatric reference shown in intraop", () => {
  // RCUK 2025: 1st shock 4 J/kg; from the 5th shock up to 8 J/kg, max 360 J.
  it("escalates the shock from the 5th and never passes 360 J", () => {
    expect(calculateRcukPediatricResuscitation({ weightKg: 24 })).toMatchObject({ value: { shockJoules: 96, escalatedShockJoules: 192 } })
    expect(calculateRcukPediatricResuscitation({ weightKg: 100 })).toMatchObject({ value: { shockJoules: 360, escalatedShockJoules: 360 } })
  })

  it("works out BSA, maintenance fluid and resuscitation from the record", () => {
    const reference = pediatricIntraopReference({ weightKg: 24, heightCm: 122, age: { value: 7, unit: "YEARS" } })
    expect(reference.bsaSquareMetres).toBe(0.9018)
    expect(reference.maintenance).toMatchObject({ dailyMl: 1580, hourlyMl: 65.8 })
    expect(reference.resuscitation).toMatchObject({ adrenalineMicrograms: 240, amiodaroneFirstDoseMilligrams: 120 })
  })

  it("leaves out what the record cannot support yet", () => {
    expect(pediatricIntraopReference({ weightKg: null, heightCm: 122 })).toMatchObject({ bsaSquareMetres: null, maintenance: null, resuscitation: null })
  })
})

describe("nil-by-mouth assignments as clock times", () => {
  it("reads each assignment back from the start of surgery in the case's zone", () => {
    // Surgery at 08:30 in Sofia (05:30 UTC).
    const rows = fastingClockTimes(
      [{ category: "SOLID_FOOD_OR_COW_MILK", hoursBefore: 6 }, { category: "CLEAR_FLUIDS", hoursBefore: 1 }, { category: "BREAST_MILK", hoursBefore: 10 }],
      "2026-10-16T05:30:00Z", "Europe/Sofia",
    )
    expect(rows).toEqual([
      { category: "CLEAR_FLUIDS", hoursBefore: 1, clock: "07:30", previousDay: false },
      { category: "SOLID_FOOD_OR_COW_MILK", hoursBefore: 6, clock: "02:30", previousDay: false },
      { category: "BREAST_MILK", hoursBefore: 10, clock: "22:30", previousDay: true },
    ])
  })

  it("has nothing to show before surgery starts", () => {
    expect(fastingClockTimes([{ category: "CLEAR_FLUIDS", hoursBefore: 1 }], null, "Europe/Sofia")).toEqual([])
    expect(fastingClockTimes([], "2026-10-16T05:30:00Z", "Europe/Sofia")).toEqual([])
  })
})
