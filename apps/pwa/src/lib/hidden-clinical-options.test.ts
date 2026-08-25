import { describe, expect, it } from "vitest"
import type {
  PediatricDrugProfileRule,
  PediatricInfusionProfileRule,
} from "@lospor/core/clinical-rules"
import type { LibraryOption } from "@lospor/core/option-library"
import {
  hiddenDrugSearchOptions,
  hiddenInfusionSearchOptions,
} from "./hidden-clinical-options"

function option(over: Partial<LibraryOption> = {}): LibraryOption {
  return {
    id: "option-a",
    value: "Testamine",
    label: "Testamine",
    labelBg: "Тестамин",
    group: "Test drugs",
    parentId: null,
    color: "#123456",
    description: null,
    drugId: null,
    atcCode: null,
    inn: "testamine",
    metadata: {
      clinicalRuleHidden: true,
      unit: "mg",
      routes: ["IV", "IM"],
      quickValues: [10, 20],
      concentrationOptions: ["1 mg/mL"],
      formulationOptions: ["ISOBARIC"],
      min: 0,
      max: 200,
      step: 1,
    },
    ...over,
  }
}

function drugRule(over: Partial<PediatricDrugProfileRule> = {}): PediatricDrugProfileRule {
  return {
    ruleKey: "ped.drug.testamine",
    ruleVersion: "7",
    medicationKey: "Testamine",
    labelEn: "Testamine",
    labelBg: "Тестамин",
    inn: "testamine",
    category: "Test drugs",
    minimumAgeDays: 0,
    maximumAgeDaysExclusive: 18 * 366,
    availability: "HIDDEN",
    profile: null,
    unit: null,
    routeUnits: {},
    manualUnit: "mg",
    sourceIds: ["source-a"],
    origin: "INSTITUTION",
    presetId: "institution-preset",
    ...over,
  }
}

function infusionRule(over: Partial<PediatricInfusionProfileRule> = {}): PediatricInfusionProfileRule {
  return {
    ruleKey: "ped.inf.testamine",
    ruleVersion: "3",
    itemKey: "Testamine",
    labelEn: "Testamine",
    labelBg: "Тестамин",
    category: "Test infusions",
    disposition: "AUTO",
    routeDispositions: { IV: "HIDDEN", IM: "HIDDEN" },
    manualEntryOnly: false,
    routeManualEntryOnly: {},
    minimumAgeDays: 0,
    maximumAgeDaysExclusive: 18 * 366,
    minimumWeightKg: null,
    minimumWeightInclusive: true,
    maximumWeightKg: null,
    maximumWeightInclusive: false,
    routineSuggestion: false,
    advisory: "guidance that must never reach the manual surface",
    profile: {
      kind: "infusion",
      mode: "rate",
      min: 0,
      max: 20,
      step: 0.1,
      rounding: "nearest_step",
      quickValues: [1, 2],
      routes: ["IV", "IM"],
      defaultRoute: "IV",
      unit: "mcg/kg/min",
      weightBasis: "TBW",
    },
    unit: null,
    routeUnits: {},
    manualUnit: null,
    sourceIds: ["source-infusion"],
    origin: "INSTITUTION_OVERRIDE",
    presetId: "institution-preset",
    ...over,
  }
}

const common = {
  patientAge: { value: 5, unit: "YEARS" as const },
  patientWeightKg: 20,
  activePreset: { id: "institution-preset", version: 4, scope: "INSTITUTION" as const },
  fallbackColor: () => "#fallback",
}

describe("search-only clinical options", () => {
  it("keeps a hidden drug searchable with audit identity but no dosing surface", () => {
    const [result] = hiddenDrugSearchOptions({
      ...common,
      options: [option()],
      pediatricDrugProfiles: [drugRule()],
      fallbackUnit: "mg",
    })

    expect(result).toEqual({
      name: "Testamine",
      unit: "mg",
      color: "#123456",
      category: "Test drugs",
      routes: ["IV", "IM"],
      rule: {
        key: "ped.drug.testamine",
        version: "7",
        sourceIds: ["source-a"],
        presetId: "institution-preset",
        presetVersion: 4,
        presetScope: "INSTITUTION",
      },
    })
    expect(Object.keys(result)).not.toEqual(expect.arrayContaining([
      "quickValues", "min", "max", "doseCalc", "concentrationOptions", "formulationOptions",
    ]))
  })

  it("treats an infusion with every route hidden as explicit-search manual entry", () => {
    const [result] = hiddenInfusionSearchOptions({
      ...common,
      options: [option({ metadata: { unit: "mcg/kg/min", routes: ["IV", "IM"] } })],
      pediatricInfusionProfiles: [infusionRule()],
      fallbackUnit: "mcg/kg/min",
    })

    expect(result.rule).toMatchObject({
      key: "ped.inf.testamine",
      version: "3",
      sourceIds: ["source-infusion"],
      presetId: "institution-preset",
      presetVersion: 4,
      presetScope: "INSTITUTION",
    })
    expect(result.routes).toEqual(["IV", "IM"])
    expect(JSON.stringify(result)).not.toContain("guidance that must never")
  })

  it("does not turn an ordinary visible option into a search-only row", () => {
    expect(hiddenDrugSearchOptions({
      ...common,
      options: [option({ metadata: { unit: "mg" } })],
      pediatricDrugProfiles: [drugRule({ availability: "AUTO" })],
      fallbackUnit: "mg",
    })).toEqual([])
  })
})
