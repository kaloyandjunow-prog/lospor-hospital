import React from "react"
import { describe, expect, it, vi } from "vitest"

// expo-haptics (pulled in via FeedbackPressable → hapticTick) needs the RN
// runtime; the tests only care about press handlers, so stub it out.
vi.mock("@/lib/haptic", () => ({ hapticTick: vi.fn() }))
vi.mock("expo-haptics", () => ({}))

import { pressByText, render } from "@/test/render"
import { FluidSheet } from "./FluidSheet"
import { DoseSelector } from "./DoseSelector"
import { AgentSheet } from "./AgentSheet"
import { PreferencesProvider } from "@/lib/preferences-context"
import { AuthProvider } from "@/lib/auth-context"
import type { DoseProfile } from "@lospor/core/catalog"
import type { PediatricFluidProfileRule } from "@lospor/core/clinical-rules"

function renderWithPreferences(element: React.ReactElement) {
  return render(
    <AuthProvider>
      <PreferencesProvider>{element}</PreferencesProvider>
    </AuthProvider>,
  )
}

// Pins the library-driven autofill behavior: fluids prefer their authored
// suggested bag volume, then fall back to the first quick value; agents use
// their first quick value. Default concentration remains preselected.

// cat values must be the option library's real group names — FluidSheet
// renders fluids under a fixed section list and exact-matches the group.
const FLUIDS = [
  { name: "HES", cat: "Colloids", color: "#f59e0b" },
  { name: "Ringer", cat: "Crystalloids", color: "#22d3ee" },
]

function fluidProfile(overrides: Partial<DoseProfile> = {}): DoseProfile {
  return {
    kind:"fluid",
    mode:"dose",
    min:5,
    max:300,
    step:5,
    rounding:"nearest_step",
    quickValues:[125, 250],
    unit:"mL",
    routes:["IV", "IO"],
    defaultRoute:"IO",
    concentrationOptions:["1%", "2.5%"],
    defaultConcentration:"2.5%",
    weightBasis:"none",
    suggestedVolume:200,
    suggestedVolumeByRoute:{ IO:225 },
    fluidEntryModes:["VOLUME"],
    defaultFluidEntryMode:"VOLUME",
    fluidRate:{ min:2, max:175, step:5, allowManualOutsideRange:true },
    ...overrides,
  }
}

function pediatricFluidRule(
  ruleKey: string,
  profile: DoseProfile = fluidProfile(),
): PediatricFluidProfileRule {
  return {
    ruleKey,
    ruleVersion:"pediatric-fluid.v1",
    itemKey:"RINGER",
    labelEn:"Ringer",
    labelBg:null,
    category:"Crystalloids",
    minimumAgeDays:0,
    maximumAgeDaysExclusive:18 * 365.2425,
    profile,
    unit:null,
    routeUnits:{},
    sourceIds:["rule:ringer"],
    origin:"USER",
    presetId:"pediatric-personal",
  }
}

describe("FluidSheet autofill on select", () => {
  it("prefills volume with the library's first quick value and the default concentration", () => {
    const setFlFluid = vi.fn()
    const setFlVol = vi.fn()
    const setFlConcentration = vi.fn()
    const tree = renderWithPreferences(
      <FluidSheet
        visible
        onClose={() => {}}
        fluidList={FLUIDS}
        flFluid={null}
        setFlFluid={setFlFluid}
        flVol="500"
        setFlVol={setFlVol}
        flEntryMode="VOLUME"
        setFlEntryMode={() => {}}
        flRate=""
        setFlRate={() => {}}
        onConfirm={() => {}}
        quickVolumes={{ HES: [250, 500, 1000, 1500] }}
        concentrations={{ HES: ["6%", "10%"] }}
        defaultConcentrations={{ HES: "6%" }}
        flConcentration={undefined}
        setFlConcentration={setFlConcentration}
      />,
    )

    pressByText(tree, "HES")

    expect(setFlFluid).toHaveBeenCalledWith(FLUIDS[0])
    expect(setFlVol).toHaveBeenCalledWith("250")
    expect(setFlConcentration).toHaveBeenCalledWith("6%")
  })

  it("falls back to sensible defaults when the library has no quick values", () => {
    const setFlVol = vi.fn()
    const tree = renderWithPreferences(
      <FluidSheet
        visible
        onClose={() => {}}
        fluidList={FLUIDS}
        flFluid={null}
        setFlFluid={() => {}}
        flVol="500"
        setFlVol={setFlVol}
        flEntryMode="VOLUME"
        setFlEntryMode={() => {}}
        flRate=""
        setFlRate={() => {}}
        onConfirm={() => {}}
        quickVolumes={{}}
      />,
    )

    pressByText(tree, "Ringer")

    expect(setFlVol).toHaveBeenCalledWith("250")
  })

  it("opens a pediatric special-dose fluid in rate mode without a 4/2/1 autofill", () => {
    const mannitol = { name: "Mannitol", cat: "Other", color: "#f97316" }
    const setFlEntryMode = vi.fn()
    const setFlRate = vi.fn()
    const tree = renderWithPreferences(
      <FluidSheet
        visible
        onClose={() => {}}
        fluidList={[mannitol]}
        flFluid={null}
        setFlFluid={() => {}}
        flVol=""
        setFlVol={() => {}}
        flEntryMode="VOLUME"
        setFlEntryMode={setFlEntryMode}
        flRate=""
        setFlRate={setFlRate}
        patientWeightKg={20}
        onConfirm={() => {}}
        pediatricMode
      />,
    )

    pressByText(tree, "Mannitol")
    expect(setFlEntryMode).toHaveBeenCalledWith("RATE")
    expect(setFlRate).toHaveBeenCalledWith("")
  })

  it("keeps blood products volume-only", () => {
    const blood = { name: "Packed red blood cells (PRBC)", cat: "Blood products", color: "#84cc16" }
    const tree = renderWithPreferences(
      <FluidSheet
        visible
        onClose={() => {}}
        fluidList={[blood]}
        flFluid={blood}
        setFlFluid={() => {}}
        flVol="250"
        setFlVol={() => {}}
        flEntryMode="VOLUME"
        setFlEntryMode={() => {}}
        flRate=""
        setFlRate={() => {}}
        onConfirm={() => {}}
        pediatricMode
      />,
    )

    expect(tree.root.findAllByProps({ testID: "fluid-mode-VOLUME" }).length).toBeGreaterThan(0)
    expect(tree.root.findAllByProps({ testID: "fluid-mode-RATE" })).toHaveLength(0)
  })

  it("clears the 4/2/1 suggestion when saline changes to 3%", () => {
    const saline = { name: "Saline", cat: "Crystalloids", color: "#d946ef" }
    const setFlRate = vi.fn()
    const setFlConcentration = vi.fn()
    const tree = renderWithPreferences(
      <FluidSheet
        visible
        onClose={() => {}}
        fluidList={[saline]}
        flFluid={saline}
        setFlFluid={() => {}}
        flVol="500"
        setFlVol={() => {}}
        flEntryMode="RATE"
        setFlEntryMode={() => {}}
        flRate="40"
        setFlRate={setFlRate}
        patientWeightKg={10}
        onConfirm={() => {}}
        concentrations={{ Saline: ["0.9%", "3%", "20%"] }}
        defaultConcentrations={{ Saline: "0.9%" }}
        flConcentration="0.9%"
        setFlConcentration={setFlConcentration}
        pediatricMode
      />,
    )

    pressByText(tree, "3%")
    expect(setFlConcentration).toHaveBeenCalledWith("3%")
    expect(setFlRate).toHaveBeenCalledWith("")
  })

  it("applies the whole unique age-matched pediatric fluid profile", () => {
    const ringer = FLUIDS[1]
    const rule = pediatricFluidRule("PEDIATRIC_FLUID_PROFILE:RINGER:0-6574")
    const setFlVol = vi.fn()
    const setFlEntryMode = vi.fn()
    const setFlConcentration = vi.fn()
    const setFlRoute = vi.fn()
    const setFlRule = vi.fn()
    const selectionTree = renderWithPreferences(
      <FluidSheet
        visible
        onClose={() => {}}
        fluidList={[ringer]}
        flFluid={null}
        setFlFluid={() => {}}
        flVol=""
        setFlVol={setFlVol}
        flEntryMode="RATE"
        setFlEntryMode={setFlEntryMode}
        flRate=""
        setFlRate={() => {}}
        onConfirm={() => {}}
        pediatricMode
        patientAge={{ value:2, unit:"YEARS" }}
        pediatricFluidProfiles={[rule]}
        setFlConcentration={setFlConcentration}
        setFlRoute={setFlRoute}
        setFlRule={setFlRule}
      />,
    )

    pressByText(selectionTree, "Ringer")
    expect(setFlVol).toHaveBeenCalledWith("225")
    expect(setFlEntryMode).toHaveBeenCalledWith("VOLUME")
    expect(setFlConcentration).toHaveBeenCalledWith("2.5%")
    expect(setFlRoute).toHaveBeenCalledWith("INTRAOSSEOUS")
    expect(setFlRule).toHaveBeenCalledWith({
      ruleKey:rule.ruleKey,
      ruleVersion:rule.ruleVersion,
      sourceIds:rule.sourceIds,
    })

    const surfaceTree = renderWithPreferences(
      <FluidSheet
        visible
        onClose={() => {}}
        fluidList={[ringer]}
        flFluid={ringer}
        setFlFluid={() => {}}
        flVol="125"
        setFlVol={() => {}}
        flEntryMode="VOLUME"
        setFlEntryMode={() => {}}
        flRate=""
        setFlRate={() => {}}
        flRoute="IO"
        setFlRoute={() => {}}
        flConcentration="2.5%"
        setFlConcentration={() => {}}
        onConfirm={() => {}}
        pediatricMode
        patientAge={{ value:2, unit:"YEARS" }}
        pediatricFluidProfiles={[rule]}
      />,
    )
    const selector = surfaceTree.root.findByType(DoseSelector)
    expect(selector.props).toMatchObject({
      quickValues:[125, 250],
      min:5,
      max:300,
      step:5,
      routes:["IV", "INTRAOSSEOUS"],
      route:"INTRAOSSEOUS",
      concentrationOptions:["1%", "2.5%"],
      concentration:"2.5%",
    })
    expect(surfaceTree.root.findAllByProps({ testID:"fluid-mode-RATE" })).toHaveLength(0)
  })

  it("updates bag volume from the route-specific suggestion instead of the first quick pill", () => {
    const ringer = FLUIDS[1]
    const rule = pediatricFluidRule("PEDIATRIC_FLUID_PROFILE:RINGER:0-6574")
    const setFlVol = vi.fn()
    const setFlRoute = vi.fn()
    const tree = renderWithPreferences(
      <FluidSheet
        visible
        onClose={() => {}}
        fluidList={[ringer]}
        flFluid={ringer}
        setFlFluid={() => {}}
        flVol="225"
        setFlVol={setFlVol}
        flEntryMode="VOLUME"
        setFlEntryMode={() => {}}
        flRate=""
        setFlRate={() => {}}
        flRoute="IO"
        setFlRoute={setFlRoute}
        flConcentration="2.5%"
        setFlConcentration={() => {}}
        onConfirm={() => {}}
        pediatricMode
        patientAge={{ value:2, unit:"YEARS" }}
        pediatricFluidProfiles={[rule]}
      />,
    )

    pressByText(tree, "Intravenous")
    expect(setFlRoute).toHaveBeenLastCalledWith("IV")
    expect(setFlVol).toHaveBeenLastCalledWith("200")
  })

  it("visibly blocks overlapping pediatric profiles instead of selecting one", () => {
    const ringer = FLUIDS[1]
    const first = pediatricFluidRule("pediatric-fluid-first")
    const second = pediatricFluidRule(
      "pediatric-fluid-second",
      fluidProfile({
        fluidEntryModes:["RATE"],
        defaultFluidEntryMode:"RATE",
      }),
    )
    const tree = renderWithPreferences(
      <FluidSheet
        visible
        onClose={() => {}}
        fluidList={[ringer]}
        flFluid={ringer}
        setFlFluid={() => {}}
        flVol=""
        setFlVol={() => {}}
        flEntryMode="VOLUME"
        setFlEntryMode={() => {}}
        flRate=""
        setFlRate={() => {}}
        onConfirm={() => {}}
        pediatricMode
        patientAge={{ value:2, unit:"YEARS" }}
        pediatricFluidProfiles={[first, second]}
      />,
    )

    expect(tree.root.findAllByProps({ testID:"fluid-profile-conflict" }).length).toBeGreaterThan(0)
    expect(tree.root.findAllByType(DoseSelector)).toHaveLength(0)
    expect(tree.root.findAllByProps({ testID:"fluid-entry-mode" })).toHaveLength(0)
  })

  it("uses an effective adult fluid profile instead of dropping its selector metadata", () => {
    const adultProfile = fluidProfile({
      fluidEntryModes:["VOLUME", "RATE"],
      defaultFluidEntryMode:"RATE",
      fluidRate:{ min:3, max:190, step:2, allowManualOutsideRange:true },
    })
    const ringer = { ...FLUIDS[1], profile:adultProfile }
    const setFlEntryMode = vi.fn()
    const setFlRate = vi.fn()
    const tree = renderWithPreferences(
      <FluidSheet
        visible
        onClose={() => {}}
        fluidList={[ringer]}
        flFluid={null}
        setFlFluid={() => {}}
        flVol=""
        setFlVol={() => {}}
        flEntryMode="VOLUME"
        setFlEntryMode={setFlEntryMode}
        flRate=""
        setFlRate={setFlRate}
        onConfirm={() => {}}
      />,
    )

    pressByText(tree, "Ringer")
    expect(setFlEntryMode).toHaveBeenCalledWith("RATE")
    expect(setFlRate).toHaveBeenCalledWith("")

    const rateTree = renderWithPreferences(
      <FluidSheet
        visible
        onClose={() => {}}
        fluidList={[ringer]}
        flFluid={ringer}
        setFlFluid={() => {}}
        flVol=""
        setFlVol={() => {}}
        flEntryMode="RATE"
        setFlEntryMode={() => {}}
        flRate="250"
        setFlRate={() => {}}
        onConfirm={() => {}}
      />,
    )
    expect(rateTree.root.findByType(DoseSelector).props).toMatchObject({
      min:1,
      max:200,
      step:1,
      manualMax:Number.MAX_SAFE_INTEGER,
    })
  })
})

describe("AgentSheet autofill on select", () => {
  it("prefills the agent percent with the library's first quick value", () => {
    const setAgPick = vi.fn()
    const setAgPercent = vi.fn()
    const tree = renderWithPreferences(
      <AgentSheet
        visible
        onClose={() => {}}
        agents={[{ name: "Sevoflurane", color: "#a855f7" }]}
        agPick={null}
        setAgPick={setAgPick}
        activeAgent={null}
        onConfirm={() => {}}
        quickPercents={{ Sevoflurane: [1, 2, 2.5, 3, 8] }}
        agPercent={null}
        setAgPercent={setAgPercent}
      />,
    )

    pressByText(tree, "Sevoflurane")

    expect(setAgPick).toHaveBeenCalledWith({ name: "Sevoflurane", color: "#a855f7" })
    expect(setAgPercent).toHaveBeenCalledWith(1)
  })
})
