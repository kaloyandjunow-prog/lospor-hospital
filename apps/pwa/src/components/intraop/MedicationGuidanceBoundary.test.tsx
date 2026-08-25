import React from "react"
import { describe, expect, it, vi } from "vitest"
import type { PediatricDrugProfileRule } from "@lospor/core/clinical-rules"
import type { PediatricPremedDrug } from "@/lib/pediatric-premedication-library"
import type { ActiveInfusion } from "@/lib/intraop-log-event"

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

import { render } from "@/test/render"
import { AgentSheet } from "./AgentSheet"
import { DoseSelector } from "./DoseSelector"
import { DrugSheet } from "./DrugSheet"
import { InfusionActionSheet } from "./InfusionActionSheet"
import { InfusionSheet } from "./InfusionSheet"
import { PremedicationLibrarySheet } from "./PremedicationLibrarySheet"

const drugCategory = {
  cat: "Test drugs",
  color: "#3b82f6",
  drugs: [{ name: "Testacaine", unit: "mg" }],
}

const drugCommon = {
  visible: true,
  onClose: () => {},
  drugCats: [drugCategory],
  favouriteNames: [],
  scenarios: [],
  drugCat: drugCategory,
  setDrugCat: () => {},
  setDrugPick: () => {},
  setDrugDose: () => {},
  dosePresets: {},
  canStartAsInfusion: false,
  onConfirm: () => {},
  onStartAsInfusion: () => {},
}

describe("medication controls and explicit guidance policy", () => {
  it("keeps inhalational-agent quick percentages and controls visible by default", () => {
    const agent = { name: "Sevoflurane", color: "#3b82f6" }
    const tree = render(
      <AgentSheet
        visible
        onClose={() => {}}
        agents={[agent]}
        agPick={agent}
        setAgPick={() => {}}
        activeAgent={null}
        onConfirm={() => {}}
        quickPercents={{ Sevoflurane: [0.5, 1, 1.5, 2] }}
        agPercent={1}
        setAgPercent={() => {}}
      />,
    )
    const rendered = JSON.stringify(tree.toJSON())

    expect(rendered).toContain("FiSevoflurane")
    const selector = tree.root.findByType(DoseSelector)
    expect(selector.props.value).toBe("1")
    expect(selector.props.quickValues).toEqual([0.5, 1, 1.5, 2])
    expect(tree.root.findAllByProps({ testID: "dose-selector-dose-pills" }).length).toBeGreaterThan(0)
  })

  it("keeps the adult configured range and quick values visible by default", () => {
    const tree = render(
      <DrugSheet
        {...drugCommon}
        drugPick={{ name: "Testacaine", unit: "mg" }}
        drugDose="2"
        drugRoute="IV"
        routes={{ Testacaine: ["IV"] }}
        dosePresets={{ Testacaine: [111, 222, 333] }}
        doseCalcs={{ Testacaine: { perKg: 0.2, basis: "TBW", hint: "1–2 mg/kg from hidden adult baseline" } }}
        patientWeightKg={10}
        baseProfiles={{
          Testacaine: { min: 0, max: 500, step: 1, quickValues: [111, 222, 333], unit: "mg" },
        }}
      />,
    )
    const rendered = JSON.stringify(tree.toJSON())

    const selector = tree.root.findByType(DoseSelector)
    expect(selector.props.value).toBe("2")
    expect(selector.props.min).toBe(0)
    expect(selector.props.max).toBe(500)
    expect(selector.props.quickValues).toEqual([111, 222, 333])
    expect(rendered).toContain("111")
    expect(tree.root.findAllByProps({ testID: "dose-selector-dose-pills" }).length).toBeGreaterThan(0)
  })

  it("turns an invalid-baseline drug surface into identity-preserving manual entry", () => {
    const tree = render(
      <DrugSheet
        {...drugCommon}
        prospectiveGuidanceEnabled={false}
        drugPick={{ name: "Testacaine", unit: "mg" }}
        drugDose=""
        drugRoute="IV"
        routes={{ Testacaine: ["IV", "IM"] }}
        dosePresets={{ Testacaine: [111, 222, 333] }}
        doseCalcs={{ Testacaine: { perKg: 0.2, basis: "TBW", hint: "hidden" } }}
        patientWeightKg={10}
        laConcentrations={{ Testacaine: ["10 mg/mL"] }}
        baseProfiles={{
          Testacaine: {
            min: 0,
            max: 500,
            step: 1,
            quickValues: [111, 222, 333],
            unit: "mg",
            concentrationOptions: ["10 mg/mL"],
          },
        }}
      />,
    )

    const selector = tree.root.findByType(DoseSelector)
    expect(selector.props.value).toBe("")
    expect(selector.props.manualEntryOnly).toBe(true)
    expect(selector.props.quickValues).toBeUndefined()
    expect(selector.props.routes).toEqual(["IV", "IM"])
    expect(selector.props.concentrationOptions).toBeUndefined()
  })

  it("turns an invalid-baseline infusion surface into route-preserving manual entry", () => {
    const infusion = { name: "Testamine", unit: "mcg/kg/min", color: "#3b82f6" }
    const tree = render(
      <InfusionSheet
        visible
        onClose={() => {}}
        prospectiveGuidanceEnabled={false}
        infDrugs={[infusion]}
        favouriteNames={[]}
        scenarios={[]}
        ratePresets={{ Testamine: ["1", "2", "3"] }}
        infDrug={infusion}
        setInfDrug={() => {}}
        infRate=""
        setInfRate={() => {}}
        onConfirm={() => {}}
        routes={{ Testamine: ["IV", "IO"] }}
        infRoute="IV"
        laConcentrations={{ Testamine: ["1 mg/mL"] }}
        suggestedRates={{ Testamine: "2" }}
        baseProfiles={{
          Testamine: {
            min: 0,
            max: 10,
            step: 0.1,
            quickValues: [1, 2, 3],
            unit: "mcg/kg/min",
            suggestedRate: 2,
            concentrationOptions: ["1 mg/mL"],
          },
        }}
      />,
    )

    const selector = tree.root.findByType(DoseSelector)
    expect(selector.props.value).toBe("")
    expect(selector.props.manualEntryOnly).toBe(true)
    expect(selector.props.quickValues).toBeUndefined()
    expect(selector.props.routes).toEqual(["IV", "IO"])
    expect(selector.props.concentrationOptions).toBeUndefined()
  })

  it("shows the approved paediatric dose/version while keeping raw source IDs internal", () => {
    const pediatricRule: PediatricDrugProfileRule = {
      ruleKey: "PED_VISIBLE_PREFILL",
      ruleVersion: "clinical-version-must-stay-hidden",
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
        quickValues: [0.1, 0.2, 0.3],
        unit: "mg",
        routes: ["IV"],
        defaultRoute: "IV",
        weightBasis: "TBW",
        doseCalc: { perKg: 0.01, basis: "TBW", roundTo: 0.1 },
      },
      unit: null,
      routeUnits: {},
      sourceIds: ["source-must-stay-hidden"],
      origin: "PRESET",
      presetId: "preset-a",
    }
    const tree = render(
      <DrugSheet
        {...drugCommon}
        drugPick={{ name: "Testacaine", unit: "mg" }}
        drugDose="0.1"
        drugRoute="IV"
        drugRule={{ key: pediatricRule.ruleKey, version: pediatricRule.ruleVersion, sourceIds: pediatricRule.sourceIds, roundTo: 0.1 }}
        pediatricMode
        pediatricDrugProfiles={[pediatricRule]}
        patientAge={{ value: 5, unit: "YEARS" }}
        patientWeightKg={12}
        pediatricRulesSource="cache"
        pediatricRulesCachedAt="2026-08-22T10:00:00.000Z"
        routes={{ Testacaine: ["IV"] }}
      />,
    )
    const rendered = JSON.stringify(tree.toJSON())

    expect(tree.root.findByType(DoseSelector).props.value).toBe("0.1")
    expect(rendered).toContain("approvedInstitutionDose")
    expect(rendered).toContain("cachedInstitutionPresetFrom")
    expect(rendered).toContain("clinical-version-must-stay-hidden")
    expect(rendered).not.toContain("source-must-stay-hidden")
    expect(tree.root.findAllByProps({ testID: "dose-selector-dose-pills" }).length).toBeGreaterThan(0)
  })

  it("changes an infusion with its configured rate pills visible", () => {
    const target: ActiveInfusion = {
      infId: "inf-1",
      name: "Testamine",
      rate: "1",
      unit: "mcg/kg/min",
      color: "#3b82f6",
      route: "IV",
    }
    const tree = render(
      <InfusionActionSheet
        visible
        onClose={() => {}}
        target={target}
        ratePresets={{ Testamine: ["0.5", "1", "2"] }}
        newRate="1.5"
        setNewRate={() => {}}
        onChangeRate={() => {}}
        onStop={() => {}}
      />,
    )
    const rendered = JSON.stringify(tree.toJSON())

    expect(rendered).toContain("mcg/kg/min")
    const selector = tree.root.findByType(DoseSelector)
    expect(selector.props.value).toBe("1.5")
    expect(selector.props.quickValues).toEqual([0.5, 1, 2])
    expect(tree.root.findAllByProps({ testID: "dose-selector-dose-pills" }).length).toBeGreaterThan(0)
  })

  it("keeps premedication hints, arithmetic, caps and controls visible by default", () => {
    const drug: PediatricPremedDrug = {
      name: "Testazolam",
      dose: 20,
      unit: "mg",
      min: 0,
      max: 100,
      step: 1,
      routes: ["PO"],
      defaultRoute: "PO",
      hint: "1–2 mg/kg from the bundled source",
      pediatric: {
        kind: "calculated",
        perKg: 1.5,
        unit: "mg",
        weightUsedKg: 20,
        basis: "TBW",
        capped: true,
        cap: 20,
      },
    }
    const tree = render(
      <PremedicationLibrarySheet
        visible
        phase="evening"
        categories={[]}
        openCategory={null}
        drug={drug}
        dose="20"
        route="PO"
        backLabel="back"
        onClose={() => {}}
        onToggleCategory={() => {}}
        onSelectDrug={() => {}}
        onBackToLibrary={() => {}}
        onDoseChange={() => {}}
        onRouteChange={() => {}}
        onAdd={() => {}}
        prospectiveGuidanceEnabled
        pediatricMode
      />,
    )
    const rendered = JSON.stringify(tree.toJSON())

    expect(rendered).toContain('"value":"20"')
    expect(rendered).toContain("1–2 mg/kg")
    expect(rendered).toContain('"1.5"')
    expect(rendered).toContain("/kg × ")
    expect(rendered).toContain("bundled source")
    expect(rendered).toContain("premedCappedAt")
  })

  it("previews calculated library doses and localizes true unavailability", () => {
    const calculated: PediatricPremedDrug = {
      name: "Calculated drug",
      dose: 20,
      unit: "mg",
      min: 0,
      max: 100,
      step: 1,
      routes: ["PO"],
      defaultRoute: "PO",
      hint: "1–2 mg/kg",
      pediatric: {
        kind: "calculated",
        perKg: 1,
        unit: "mg",
        weightUsedKg: 20,
        basis: "TBW",
        capped: false,
        cap: 100,
      },
    }
    const unavailable: PediatricPremedDrug = {
      ...calculated,
      name: "Unavailable drug",
      dose: 0,
      pediatric: { kind: "withheld", reason: "Raw upstream clinical reason" },
    }
    const tree = render(
      <PremedicationLibrarySheet
        visible
        phase="morning"
        categories={[{ category: "Sedation", drugs: [calculated, unavailable] }]}
        openCategory="Sedation"
        drug={null}
        dose=""
        route=""
        backLabel="back"
        onClose={() => {}}
        onToggleCategory={() => {}}
        onSelectDrug={() => {}}
        onBackToLibrary={() => {}}
        onDoseChange={() => {}}
        onRouteChange={() => {}}
        onAdd={() => {}}
        prospectiveGuidanceEnabled
        pediatricMode
      />,
    )
    const rendered = JSON.stringify(tree.toJSON())

    expect(rendered).toContain("20 mg")
    expect(rendered).not.toContain("1–2 mg/kg")
    expect(rendered).not.toContain("Raw upstream clinical reason")
    expect(rendered).toContain("premedUnavailableForChild")
  })
})
