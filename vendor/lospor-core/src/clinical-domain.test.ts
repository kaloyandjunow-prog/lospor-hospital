import { describe, expect, it } from "vitest"
import {
  applyClinicalPreferencesPatch,
  combineClinicalPreferencesPatches,
  mergeClinicalPreferences,
  normalizeClinicalPreferences,
} from "./clinical-preferences"
import {
  buildCanonicalPreopFormPayload,
  canonicalizePostopPatch,
  canonicalizePreopPatch,
} from "./case-payloads"
import { deriveCaseStage } from "./case-status"
import {
  evaluateCaseFinalization,
  evaluateIntraopReadiness,
  evaluatePreopReadiness,
  validatePostopPatch,
  validatePreopPatch,
} from "./clinical-validation"
import {
  canonicalizeOptionPreferences,
  optionIdentity,
  optionIdentityKey,
  parseLibraryOption,
  resolveOptionPreferenceLabels,
  type JsonObject,
} from "./option-contracts"
import {
  optionStyleMap,
  premedicationDoseMap,
  rangeSpecFromOption,
  weightBasisMap,
} from "./option-library"

describe("canonical case payloads", () => {
  it("maps legacy aliases without erasing omitted fields", () => {
    expect(canonicalizePreopPatch({
      ulbt: "II",
      difficultAirway: false,
      familyProblems: false,
      diagnoses: [{ label: "Appendicitis", code: "K35" }],
    })).toMatchObject({
      upperLipBiteTest: "CLASS_II",
      difficultAirwayHistory: false,
      difficultAirwayNotes: null,
      familyAnesthesiaProblems: false,
      familyAnesthesiaDetails: null,
      diagnosis: "Appendicitis",
      icdCode: "K35",
    })
  })

  it("derives scores and legacy labels from a full preop form", () => {
    const payload = buildCanonicalPreopFormPayload({
      ageYears: 55,
      sex: "MALE",
      heightCm: 171,
      weightKg: 122,
      diagnoses: [{ label: "Prostate cancer" }],
      procedures: [{ label: "Prostatectomy" }],
      stopbangBP: true,
    })
    expect(payload).toMatchObject({
      diagnosis: "Prostate cancer",
      plannedProcedure: "Prostatectomy",
      bmi: expect.any(Number),
      rcriScore: expect.any(Number),
      stopBangScore: expect.any(Number),
    })
  })

  it("normalizes postop aliases, totals, and handover clearing", () => {
    expect(canonicalizePostopPatch({
      activityScore: "2",
      respirationScore: 2,
      circulationScore: 2,
      consciousnessScore: 2,
      spO2Score: 2,
      disposition: "ICU",
      handoverItems: ["obs_freq"],
      dispositionNotes: "note",
    })).toMatchObject({
      aldreteActivity: 2,
      aldreteTotal: 10,
      handoverItems: [],
      dispositionNotes: null,
    })
  })
})

describe("clinical validation and readiness", () => {
  it("preserves partial-save semantics and reports only invalid supplied fields", () => {
    expect(validatePreopPatch({})).toEqual({ valid: true, issues: [] })
    expect(validatePreopPatch({ ageYears: 150 })).toMatchObject({
      valid: false,
      issues: [{ code: "out_of_range", path: ["ageYears"], min: 0, max: 149 }],
    })
    expect(validatePreopPatch({ ageYears: null })).toEqual({ valid: true, issues: [] })
    expect(validatePostopPatch({ aldreteActivity: 3 }).valid).toBe(false)
  })

  it("uses one preop completeness gate", () => {
    const result = evaluatePreopReadiness({
      ageYears: 55,
      sex: "UNKNOWN",
      heightCm: 171,
      weightKg: 122,
      diagnoses: [{ label: "Diagnosis" }],
      procedures: [{ label: "Procedure" }],
      bpUnobtainable: true,
      heartRateUnobtainable: true,
      respiratoryRateUnobtainable: true,
      airwayUnobtainable: true,
      asaScore: "III",
    })
    expect(result.issues.map(item => item.code)).toEqual(["missing_sex"])
  })

  it("preserves the server finalization reason codes", () => {
    const result = evaluateCaseFinalization({
      preop: {
        ageYears: 55,
        sex: "MALE",
        heightCm: 171,
        weightKg: 122,
        diagnosis: "Diagnosis",
        plannedProcedure: "Procedure",
        bpUnobtainable: true,
        heartRateUnobtainable: true,
        respiratoryRateUnobtainable: true,
        airwayUnobtainable: true,
        asaScore: "III",
      },
      intraop: {
        startTime: new Date("2000-01-01T08:00:00Z"),
        endTime: new Date("2000-01-01T07:00:00Z"),
        techniques: [],
      },
      postop: {},
    })
    expect(result.issues.filter(item => item.severity === "error").map(item => item.code)).toEqual([
      "missing_technique",
      "invalid_intraop_times",
      "missing_aldrete",
      "missing_disposition",
    ])
    expect(result.issues.filter(item => item.severity === "warning").map(item => item.code)).toEqual([
      "missing_airway_documentation",
      "missing_position",
      "missing_monitoring",
      "missing_vascular_access",
      "missing_vitals",
      "missing_medications",
      "missing_fluids",
      "missing_complication_documentation",
    ])
  })

  it("accepts an explicit next-day wall clock and reads projected event logs", () => {
    const result = evaluateIntraopReadiness({
      startTime: "23:55",
      endTime: "00:10",
      endTimeNextDay: true,
      techniques: ["GENERAL_BALANCED"],
      positions: ["SUPINE"],
      airwayDevices: ["ORAL_ETT"],
      vascularAccesses: [{ siteLabel: "Peripheral IV" }],
      ecg: true,
      complications: "None",
      keyEvents: {
        log: [
          { type: "vital" },
          { type: "drug" },
          { type: "fluid_bolus" },
        ],
      },
    })
    expect(result.issues).toEqual([])
  })
})

describe("display stages, options, and clinical preferences", () => {
  it("keeps persisted statuses separate from derived display stages", () => {
    expect(deriveCaseStage({
      status: "DRAFT",
      preop: { diagnosis: "D", plannedProcedure: "P", asaScore: "II" },
    })).toBe("AWAITING_ALLOCATION")
    expect(deriveCaseStage({ status: "IN_PROGRESS", intraop: { endTime: "10:00" } }))
      .toBe("AWAITING_POSTOP")
  })

  it("uses category plus stable value/code instead of the display label", () => {
    const option = parseLibraryOption({
      id: "1",
      category: "INTRAOP_DRUG",
      value: "propofol",
      label: "Propofol",
      drugId: "drug-1",
      metadata: { unit: "mg" },
    })
    expect(option).not.toBeNull()
    const identity = optionIdentity("INTRAOP_DRUG", option!)
    expect(optionIdentityKey(identity)).toBe("INTRAOP_DRUG:propofol:drug-1")
    expect(canonicalizeOptionPreferences(
      "INTRAOP_DRUG",
      [option!],
      ["Propofol"],
    )).toEqual(["INTRAOP_DRUG:propofol:drug-1"])
    expect(resolveOptionPreferenceLabels(
      "INTRAOP_DRUG",
      [option!],
      ["INTRAOP_DRUG:propofol:drug-1"],
    )).toEqual(["Propofol"])
  })

  it("accepts complete numeric range metadata and rejects malformed metadata", () => {
    expect(rangeSpecFromOption({
      metadata: { min: 30, max: 280, step: 1, unit: "cm" },
    })).toEqual({ min: 30, max: 280, step: 1, unit: "cm" })
    expect(rangeSpecFromOption({
      metadata: { min: 30, max: "280", step: 1, unit: "cm" },
    })).toBeUndefined()
  })

  it("strictly normalizes option metadata used by both clients", () => {
    const option = (label: string, metadata: JsonObject | null) => ({
      id: label,
      value: label.toLowerCase(),
      label,
      labelBg: null,
      group: null,
      parentId: null,
      color: null,
      description: null,
      drugId: null,
      atcCode: null,
      inn: null,
      metadata,
    })

    expect(weightBasisMap([
      option("A", { weightBasis: "TBW" }),
      option("B", { weightBasis: "unexpected" }),
    ])).toEqual({ A: "TBW", B: "IBW" })
    expect(optionStyleMap([
      option("Complete", { bar: "#1", text: "#2", grip: "#3" }),
      option("Incomplete", { bar: "#1" }),
    ])).toEqual({ Complete: { bar: "#1", text: "#2", grip: "#3" } })
    expect(premedicationDoseMap([
      option("Midazolam", { dose: 2, unit: "mg", routes: ["IV"], defaultRoute: "IV" }),
    ])).toEqual({
      Midazolam: {
        dose: 2,
        unit: "mg",
        min: 0,
        max: 100,
        step: 1,
        routes: ["IV"],
        defaultRoute: "IV",
        hint: "",
      },
    })
  })

  it("imports missing device settings once and lets server values win", () => {
    const merged = mergeClinicalPreferences(
      { units: { height: "cm" }, intraopFavouriteDrugs: ["Propofol"] },
      {
        heightUnit: "in",
        weightUnit: "lb",
        autoFillVitals: true,
        autoFillBP: true,
      },
    )
    expect(merged.units).toEqual({ height: "cm", weight: "lb", temperature: "C", etco2: "mmHg" })
    expect(merged.autoFillVitals).toEqual({
      enabled: true,
      includeBloodPressure: true,
      backfillOnReopen: false,
    })
    expect(merged.intraopFavouriteDrugs).toEqual(["Propofol"])

    expect(applyClinicalPreferencesPatch(merged, {
      autoFillVitals: { enabled: false, includeBloodPressure: true },
    }).autoFillVitals).toEqual({
      enabled: false,
      includeBloodPressure: false,
      backfillOnReopen: false,
    })
    expect(normalizeClinicalPreferences({ intraopFavouriteDrugs: ["A", "A"] })
      .intraopFavouriteDrugs).toEqual(["A"])
  })

  it("combines only the fields changed while offline", () => {
    expect(combineClinicalPreferencesPatches(
      { units: { height: "in" }, autoFillVitals: { enabled: true } },
      { units: { weight: "lb" }, autoFillVitals: { includeBloodPressure: true } },
    )).toEqual({
      units: { height: "in", weight: "lb" },
      autoFillVitals: { enabled: true, includeBloodPressure: true },
    })
  })
})
