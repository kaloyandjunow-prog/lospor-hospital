import React, { useState } from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import type { PediatricDrugProfileRule } from "@lospor/core/clinical-rules"

vi.mock("@/components/VitalStepper", () => ({ VitalStepper: () => null }))
vi.mock("@/lib/haptic", () => ({ hapticTick: vi.fn() }))
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({
    language: "en",
    tc: (key: string) => key,
  }),
}))
vi.mock("@/lib/clinical-display", () => ({
  displayClinicalCode: (
    _category: string,
    value: string,
    _language: string,
    fallback?: { label?: string },
  ) => fallback?.label ?? value,
}))

import { pressByText, render } from "@/test/render"
import type { DrugFormulation } from "@/lib/intraop-log-event"
import type { DrugEntryDraft } from "@/lib/use-drug-entry"
import { DrugSheet } from "./DrugSheet"

const cat = {
  cat: "Test drugs",
  color: "#3b82f6",
  drugs: [{ name: "Testacaine", unit: "mg" }],
}

const commonProps = {
  visible: true,
  onClose: () => {},
  drugCats: [cat],
  favouriteNames: [],
  scenarios: [],
  drugCat: cat,
  setDrugCat: () => {},
  drugPick: null,
  setDrugPick: () => {},
  drugDose: "",
  setDrugDose: () => {},
  dosePresets: {},
  canStartAsInfusion: false,
  onConfirm: () => {},
  onStartAsInfusion: () => {},
}

const band = (over: Partial<PediatricDrugProfileRule>): PediatricDrugProfileRule => ({
  ruleKey: "PED_A",
  ruleVersion: "1",
  medicationKey: "Testacaine",
  labelEn: "Testacaine",
  labelBg: null,
  inn: "testacaine",
  category: "Test drugs",
  minimumAgeDays: 0,
  maximumAgeDaysExclusive: 18 * 366,
  profile: {
    kind: "bolus",
    mode: "dose",
    min: 0,
    max: 20,
    step: 0.1,
    rounding: "nearest_step",
    quickValues: [0.1],
    unit: "mg",
    routes: ["IV"],
    defaultRoute: "IV",
    weightBasis: "TBW",
    doseCalc: { perKg: 0.01, basis: "TBW", roundTo: 0.1 },
  },
  unit: null,
  routeUnits: {},
  sourceIds: [],
  origin: "PRESET",
  presetId: "preset-a",
  ...over,
})

const OVERLAPPING_BANDS = [
  band({ ruleKey: "PED_A", minimumAgeDays: 0, maximumAgeDaysExclusive: 18 * 366 }),
  band({ ruleKey: "PED_B", minimumAgeDays: 365, maximumAgeDaysExclusive: 18 * 366 }),
]

describe("DrugSheet atomic selector defaults", () => {
  it("preselects the adult route, dose, concentration, and formulation together", () => {
    const applyDrugSelection = vi.fn<(selection: DrugEntryDraft) => void>()
    const surface = {
      mode: "concentration",
      min: 0,
      max: 20,
      step: 1,
      quickValues: [2, 4, 6],
      unit: "mg",
      concentrationOptions: ["1 mg/mL", "2 mg/mL"],
      defaultConcentration: "2 mg/mL",
      formulationOptions: ["ISOBARIC", "HYPERBARIC"] as DrugFormulation[],
      defaultFormulation: "HYPERBARIC" as const,
    }
    const tree = render(
      <DrugSheet
        {...commonProps}
        routes={{ Testacaine: ["IV"] }}
        routeProfiles={{ Testacaine: { IV: surface } }}
        applyDrugSelection={applyDrugSelection}
      />,
    )

    pressByText(tree, "Testacaine")

    expect(applyDrugSelection).toHaveBeenCalledWith({
      pick: { name: "Testacaine", unit: "mg" },
      dose: "2",
      route: "IV",
      concentration: "2 mg/mL",
      formulation: "HYPERBARIC",
    })
  })

  it("replaces every route-dependent field in one route change", () => {
    const applyDrugSelection = vi.fn<(selection: DrugEntryDraft) => void>()
    const tree = render(
      <DrugSheet
        {...commonProps}
        drugPick={{ name: "Testacaine", unit: "mg" }}
        drugDose="2"
        drugRoute="IV"
        drugConcentration="1 mg/mL"
        drugFormulation="ISOBARIC"
        routes={{ Testacaine: ["IV", "IM"] }}
        routeProfiles={{
          Testacaine: {
            IV: {
              mode: "concentration",
              min: 0,
              max: 10,
              step: 1,
              quickValues: [2],
              unit: "mg",
              concentrationOptions: ["1 mg/mL"],
              formulationOptions: ["ISOBARIC"],
            },
            IM: {
              mode: "concentration",
              min: 0,
              max: 50,
              step: 5,
              quickValues: [20, 40],
              unit: "mg",
              concentrationOptions: ["2 mg/mL"],
              formulationOptions: ["HYPERBARIC"],
            },
          },
        }}
        applyDrugSelection={applyDrugSelection}
      />,
    )

    act(() => tree.root.findByProps({ testID: "dose-route-IM" }).props.onPress())

    expect(applyDrugSelection).toHaveBeenCalledWith({
      pick: { name: "Testacaine", unit: "mg" },
      dose: "20",
      route: "IM",
      concentration: "2 mg/mL",
      formulation: "HYPERBARIC",
    })
  })

  it("uses the canonical pediatric profile surface for autofill and pill provenance", () => {
    const applyDrugSelection = vi.fn<(selection: DrugEntryDraft) => void>()
    const pediatricRule: PediatricDrugProfileRule = {
      ruleKey: "PED_TESTACAINE",
      ruleVersion: "4",
      medicationKey: "Testacaine",
      labelEn: "Testacaine",
      labelBg: null,
      inn: "testacaine",
      category: "Test drugs",
      minimumAgeDays: 0,
      maximumAgeDaysExclusive: 18 * 366,
      profile: {
        kind: "bolus",
        mode: "dose",
        min: 0,
        max: 20,
        step: 0.1,
        rounding: "nearest_step",
        quickValues: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
        unit: "mg",
        routes: ["IV", "IM"],
        defaultRoute: "IV",
        weightBasis: "TBW",
        doseCalc: { perKg: 0.01, basis: "TBW", roundTo: 0.1 },
      },
      unit: null,
      routeUnits: {},
      sourceIds: ["source-a"],
      origin: "PRESET",
      presetId: "preset-a",
    }
    const tree = render(
      <DrugSheet
        {...commonProps}
        pediatricMode
        pediatricDrugProfiles={[pediatricRule]}
        patientAge={{ value: 5, unit: "YEARS" }}
        patientWeightKg={12}
        routes={{ Testacaine: ["IV", "IM"] }}
        applyDrugSelection={applyDrugSelection}
      />,
    )

    pressByText(tree, "Testacaine")

    expect(applyDrugSelection).toHaveBeenCalledWith({
      pick: { name: "Testacaine", unit: "mg" },
      dose: "0.1",
      route: "IV",
      rule: {
        key: "PED_TESTACAINE",
        version: "4",
        sourceIds: ["source-a"],
        roundTo: 0.1,
      },
    })
  })

  it("does not turn the first quick pill into autofill when pediatric IBW is unavailable", () => {
    const applyDrugSelection = vi.fn<(selection: DrugEntryDraft) => void>()
    const pediatricRule: PediatricDrugProfileRule = {
      ruleKey: "PED_IBW_TESTACAINE",
      ruleVersion: "1",
      medicationKey: "Testacaine",
      labelEn: "Testacaine",
      labelBg: null,
      inn: "testacaine",
      category: "Test drugs",
      minimumAgeDays: 0,
      maximumAgeDaysExclusive: 18 * 366,
      profile: {
        kind: "bolus",
        mode: "dose",
        min: 0,
        max: 100,
        step: 1,
        rounding: "nearest_step",
        quickValues: [10, 20],
        unit: "mg",
        routes: ["IV"],
        defaultRoute: "IV",
        weightBasis: "IBW",
        doseCalc: { perKg: 1, basis: "IBW", roundTo: 1 },
      },
      unit: null,
      routeUnits: {},
      sourceIds: ["source-a"],
      origin: "PRESET",
      presetId: "preset-a",
    }
    const tree = render(
      <DrugSheet
        {...commonProps}
        pediatricMode
        pediatricDrugProfiles={[pediatricRule]}
        patientAge={{ value: 5, unit: "YEARS" }}
        patientWeightKg={30}
        routes={{ Testacaine: ["IV"] }}
        applyDrugSelection={applyDrugSelection}
      />,
    )

    pressByText(tree, "Testacaine")

    expect(applyDrugSelection).toHaveBeenCalledWith(expect.objectContaining({
      dose: "",
      route: "IV",
    }))
  })
})

/**
 * Overlapping paediatric bands are an authoring mistake, and the phone used to
 * resolve one by taking the first profile after sorting — offering a dose from
 * a band nobody chose. The web app refused the same case, so the two disagreed
 * about a child depending on which was in the anaesthetist's hand.
 *
 * Both now apply the rule from @lospor/core/clinical-rules: exactly one, or
 * nothing.
 */
describe("DrugSheet with overlapping pediatric bands", () => {
  it("offers no dose when two bands both contain the child", () => {
    const applyDrugSelection = vi.fn<(selection: DrugEntryDraft) => void>()
    const tree = render(
      <DrugSheet
        {...commonProps}
        pediatricMode
        pediatricDrugProfiles={OVERLAPPING_BANDS}
        patientAge={{ value: 5, unit: "YEARS" }}
        patientWeightKg={12}
        routes={{ Testacaine: ["IV"] }}
        applyDrugSelection={applyDrugSelection}
      />,
    )

    pressByText(tree, "Testacaine")

    // Selecting the drug is still allowed — it is the autofilled dose and the
    // rule provenance that must not be invented.
    const selection = applyDrugSelection.mock.calls.at(-1)?.[0]
    expect(selection?.dose, "a dose was invented from an ambiguous band").toBeFalsy()
    expect(selection?.rule, "a rule was credited that nobody chose").toBeUndefined()
  })

  it("still autofills when only one band contains the child", () => {
    const applyDrugSelection = vi.fn<(selection: DrugEntryDraft) => void>()
    const tree = render(
      <DrugSheet
        {...commonProps}
        pediatricMode
        pediatricDrugProfiles={[
          band({ ruleKey: "PED_A", minimumAgeDays: 0, maximumAgeDaysExclusive: 365 }),
          band({ ruleKey: "PED_B", minimumAgeDays: 365, maximumAgeDaysExclusive: 18 * 366 }),
        ]}
        patientAge={{ value: 5, unit: "YEARS" }}
        patientWeightKg={12}
        routes={{ Testacaine: ["IV"] }}
        applyDrugSelection={applyDrugSelection}
      />,
    )

    pressByText(tree, "Testacaine")

    const selection = applyDrugSelection.mock.calls.at(-1)?.[0]
    expect(selection?.dose).toBe("0.1")
    expect(selection?.rule?.key).toBe("PED_B")
  })
})

/**
 * Refusing to invent a dose left the anaesthetist nowhere to go: the dose field
 * was live, but the confirm button behind it could never enable and nothing on
 * screen said why. A conflict has to be stated, and the drug still recorded by
 * hand — that is the whole point of allowing a manual dose.
 */
describe("DrugSheet conflict is stated and still recordable", () => {
  function Harness({ onSave }: { onSave: (draft: DrugEntryDraft) => void }) {
    const [draft, setDraft] = useState<DrugEntryDraft>({ pick: null, dose: "" })
    return (
      <DrugSheet
        {...commonProps}
        pediatricMode
        pediatricDrugProfiles={OVERLAPPING_BANDS}
        patientAge={{ value: 5, unit: "YEARS" }}
        patientWeightKg={12}
        routes={{ Testacaine: ["IV"] }}
        drugPick={draft.pick}
        drugDose={draft.dose}
        drugRoute={draft.route}
        drugRule={draft.rule}
        setDrugPick={pick => setDraft(current => ({ ...current, pick }))}
        setDrugDose={dose => setDraft(current => ({ ...current, dose }))}
        applyDrugSelection={setDraft}
        onConfirm={() => onSave(draft)}
      />
    )
  }

  it("states the conflict, then records the hand-entered dose with no rule credited", () => {
    const onSave = vi.fn<(draft: DrugEntryDraft) => void>()
    const tree = render(<Harness onSave={onSave} />)

    pressByText(tree, "Testacaine")

    const alerts = tree.root.findAllByProps({ testID: "drug-profile-conflict" })
    expect(alerts.length, "the conflict was not stated anywhere on screen").toBeGreaterThan(0)
    expect(alerts[0].props.accessibilityRole).toBe("alert")

    act(() => tree.root.findByProps({ testID: "dose-manual-input" }).props.onChangeText("0.4"))

    const confirm = tree.root.findByProps({ testID: "drug-sheet-confirm" })
    expect(confirm.props.disabled, "a typed dose could not be confirmed").toBe(false)
    act(() => confirm.props.onPress())

    const saved = onSave.mock.calls.at(-1)?.[0]
    expect(saved?.dose).toBe("0.4")
    expect(saved?.rule, "a rule was credited that nobody chose").toBeUndefined()
  })
})
