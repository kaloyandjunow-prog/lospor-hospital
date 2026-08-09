import React from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/haptic", () => ({ hapticTick: vi.fn() }))
vi.mock("expo-haptics", () => ({}))

import { AuthProvider } from "@/lib/auth-context"
import { PreferencesProvider } from "@/lib/preferences-context"
import { buildIntraopPreopSummary } from "@/lib/intraop-preop-summary"
import { pressByText, render } from "@/test/render"
import { AgentSheet } from "./AgentSheet"
import { DrugSheet } from "./DrugSheet"
import { FluidSheet } from "./FluidSheet"
import { InfusionSheet } from "./InfusionSheet"
import { createPediatricInfusionProfileSeeds } from "@lospor/core"
import {
  clinicalPresetRulesToEffective,
  clinicalRuleKey,
  pediatricInfusionProfilesFromRules,
} from "@lospor/core/clinical-rules"

function renderWithPreferences(element: React.ReactElement) {
  return render(
    <AuthProvider>
      <PreferencesProvider>{element}</PreferencesProvider>
    </AuthProvider>,
  )
}

describe("pediatric intraoperative safety", () => {
  it("hydrates clinical mode and precise age into the intraoperative summary", () => {
    expect(buildIntraopPreopSummary({
      ageYears: 0,
      ageValue: 8,
      ageUnit: "MONTHS",
      ageApproxDays: 243.5,
      weightKg: 8.2,
    }, "PEDIATRIC")).toMatchObject({
      clinicalMode: "PEDIATRIC",
      age: 0,
      ageValue: 8,
      ageUnit: "MONTHS",
      ageApproxDays: 243.5,
      weight: 8.2,
    })
  })

  it("clears adult bolus suggestions when a pediatric route changes", () => {
    const setDrugDose = vi.fn()
    const setDrugRoute = vi.fn()
    const tree = renderWithPreferences(
      <DrugSheet
        visible
        onClose={() => {}}
        drugCats={[{
          cat: "Induction",
          color: "#3b82f6",
          drugs: [{ name: "Propofol", unit: "mg" }],
        }]}
        favouriteNames={[]}
        scenarios={[]}
        drugCat={{ cat: "Induction", color: "#3b82f6", drugs: [{ name: "Propofol", unit: "mg" }] }}
        setDrugCat={() => {}}
        drugPick={{ name: "Propofol", unit: "mg" }}
        setDrugPick={() => {}}
        drugDose="150"
        setDrugDose={setDrugDose}
        dosePresets={{ Propofol: [50, 100, 150] }}
        ranges={{ Propofol: { min: 0, max: 500, step: 5 } }}
        canStartAsInfusion={false}
        onConfirm={() => {}}
        onStartAsInfusion={() => {}}
        routes={{ Propofol: ["IV", "INTRAOSSEOUS"] }}
        drugRoute="IV"
        setDrugRoute={setDrugRoute}
        doseCalcs={{ Propofol: { perKg: 2, hint: "2 mg/kg" } }}
        patientWeightKg={25}
        pediatricMode
      />,
    )

    pressByText(tree, "Intraosseous")
    expect(setDrugRoute).toHaveBeenLastCalledWith("INTRAOSSEOUS")
    expect(setDrugDose).toHaveBeenLastCalledWith("")
  })

  it("clears adult infusion rates and concentrations for pediatric route changes", () => {
    const setInfRate = vi.fn()
    const setInfConcentration = vi.fn()
    const setInfRoute = vi.fn()
    const tree = renderWithPreferences(
      <InfusionSheet
        visible
        onClose={() => {}}
        infDrugs={[{ name: "Noradrenaline", unit: "mcg/kg/min", color: "#ef4444" }]}
        favouriteNames={[]}
        scenarios={[]}
        ratePresets={{ Noradrenaline: ["0.05", "0.1"] }}
        infDrug={{ name: "Noradrenaline", unit: "mcg/kg/min", color: "#ef4444" }}
        setInfDrug={() => {}}
        infRate="0.1"
        setInfRate={setInfRate}
        onConfirm={() => {}}
        routes={{ Noradrenaline: ["IV", "INTRAOSSEOUS"] }}
        infRoute="IV"
        setInfRoute={setInfRoute}
        infConcentration="40 mcg/mL"
        setInfConcentration={setInfConcentration}
        baseProfiles={{
          Noradrenaline: {
            min: 0,
            max: 2,
            step: 0.01,
            quickValues: [0.05, 0.1],
            unit: "mcg/kg/min",
            suggestedRate: 0.05,
            suggestedConcentration: "40 mcg/mL",
          },
        }}
        pediatricMode
      />,
    )

    pressByText(tree, "Intraosseous")
    expect(setInfRoute).toHaveBeenLastCalledWith("INTRAOSSEOUS")
    expect(setInfRate).toHaveBeenLastCalledWith("")
    expect(setInfConcentration).toHaveBeenLastCalledWith(undefined)
  })

  it("uses the approved pediatric infusion profile for route, autofill and provenance", () => {
    const propofolSeeds = createPediatricInfusionProfileSeeds()
      .filter(seed => seed.payload.itemKey === "Propofol")
    const profiles = pediatricInfusionProfilesFromRules(clinicalPresetRulesToEffective(
      "pediatric-platform",
      "PLATFORM",
      propofolSeeds.map((seed, index) => ({
        id: `propofol-${index}`,
        ruleKey: clinicalRuleKey(seed.payload),
        ruleVersion: "LOSPOR_PEDIATRICS.v1.draft1",
        payload: seed.payload,
        sourceRefs: seed.sourceRefs,
      })),
    ))
    const setInfDrug = vi.fn()
    const setInfRate = vi.fn()
    const setInfRoute = vi.fn()
    const setInfRule = vi.fn()
    const tree = renderWithPreferences(
      <InfusionSheet
        visible
        onClose={() => {}}
        infDrugs={[{ name: "Propofol", unit: "mg/kg/hr", color: "#3b82f6" }]}
        favouriteNames={["Propofol"]}
        scenarios={[]}
        ratePresets={{}}
        infDrug={null}
        setInfDrug={setInfDrug}
        infRate=""
        setInfRate={setInfRate}
        onConfirm={() => {}}
        setInfRoute={setInfRoute}
        setInfRule={setInfRule}
        pediatricMode
        pediatricInfusionProfiles={profiles}
        patientAge={{ value: 10, unit: "YEARS" }}
        patientWeightKg={30}
      />,
    )

    pressByText(tree, "Favourites")
    pressByText(tree, "Propofol")
    expect(setInfDrug).toHaveBeenLastCalledWith(expect.objectContaining({ unit: "mg/kg/hr" }))
    expect(setInfRoute).toHaveBeenLastCalledWith("IV")
    expect(setInfRate).toHaveBeenLastCalledWith("10")
    expect(setInfRule).toHaveBeenLastCalledWith(expect.objectContaining({
      key: "PEDIATRIC_INFUSION_PROFILE:PROPOFOL:28-6574.365:ANY-ANY",
      version: "LOSPOR_PEDIATRICS.v1.draft1",
    }))
  })

  it("defaults pediatric maintenance fluid entry to a 4/2/1 rate while retaining the bag choice", () => {
    const fluid = { name: "Ringer", cat: "Crystalloids", color: "#22d3ee" }
    const setFlVol = vi.fn()
    const setFlEntryMode = vi.fn()
    const setFlRate = vi.fn()
    const setFlConcentration = vi.fn()
    const tree = renderWithPreferences(
      <FluidSheet
        visible
        onClose={() => {}}
        fluidList={[fluid]}
        flFluid={null}
        setFlFluid={() => {}}
        flVol=""
        setFlVol={setFlVol}
        flEntryMode="VOLUME"
        setFlEntryMode={setFlEntryMode}
        flRate=""
        setFlRate={setFlRate}
        patientWeightKg={25}
        onConfirm={() => {}}
        quickVolumes={{ Ringer: [250, 500] }}
        defaultConcentrations={{ Ringer: "Standard" }}
        setFlConcentration={setFlConcentration}
        pediatricMode
      />,
    )

    pressByText(tree, "Ringer")
    expect(setFlVol).toHaveBeenLastCalledWith("250")
    expect(setFlEntryMode).toHaveBeenLastCalledWith("RATE")
    expect(setFlRate).toHaveBeenLastCalledWith("70")
    expect(setFlConcentration).toHaveBeenLastCalledWith("Standard")
  })

  it("does not prefill an inhaled-agent concentration in pediatric mode", () => {
    const agent = { name: "Sevoflurane", color: "#a855f7" }
    const setAgPercent = vi.fn()
    const tree = renderWithPreferences(
      <AgentSheet
        visible
        onClose={() => {}}
        agents={[agent]}
        agPick={null}
        setAgPick={() => {}}
        activeAgent={null}
        onConfirm={() => {}}
        quickPercents={{ Sevoflurane: [1, 2, 3] }}
        agPercent={null}
        setAgPercent={setAgPercent}
        pediatricMode
      />,
    )

    pressByText(tree, "Sevoflurane")
    expect(setAgPercent).toHaveBeenLastCalledWith(null)
  })
})
