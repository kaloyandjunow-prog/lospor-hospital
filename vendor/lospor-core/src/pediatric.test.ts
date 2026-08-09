import { describe, expect, it } from "vitest"
import {
  APAGBI_FASTING_POLICY_2023,
  calculateColds,
  calculatePovoc,
  classifyPediatricVital,
  evaluatePediatricFasting,
  getPediatricVitalReference,
  normalizePediatricAge,
  pediatricAgeToApproximateDays,
  recommendPediatricPainScale,
  requiresPediatricModeDecision,
  validateClinicalModeAge,
  validatePediatricAge,
} from "./pediatric"
import {
  calculateMostellerBsa,
  calculatePediatricBloodVolume,
  calculatePediatricMaintenanceFluid,
  calculatePediatricLocalAnaestheticLimit,
  calculateRcukPediatricResuscitation,
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

  it("selects pain scales by ability and checks versioned fasting policy", () => {
    expect(recommendPediatricPainScale({ ageYears: 2, canSelfReport: false }).scale).toBe("FLACC")
    expect(recommendPediatricPainScale({ ageYears: 5, canSelfReport: true }).scale).toBe("FPS_R")
    expect(evaluatePediatricFasting({
      category: "CLEAR_FLUIDS",
      lastIntakeAt: "2026-07-29T08:00:00Z",
      assessmentAt: "2026-07-29T09:00:00Z",
      policy: APAGBI_FASTING_POLICY_2023,
    }).status).toBe("MET")
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
