import type { ReactElement } from "react"
import type { DoseProfile } from "@lospor/core/catalog"
import type { PediatricFluidProfileRule } from "@lospor/core/clinical-rules"
import { AuthProvider } from "@/lib/auth-context"
import { PreferencesProvider } from "@/lib/preferences-context"
import { render } from "@/test/render"

export function renderWithPreferences(element: ReactElement) {
  return render(
    <AuthProvider>
      <PreferencesProvider initialLanguage="en">{element}</PreferencesProvider>
    </AuthProvider>,
  )
}

// cat values must be the option library's real group names — FluidSheet
// renders fluids under a fixed section list and exact-matches the group.
export const FLUIDS = [
  { name: "HES", cat: "Colloids", color: "#f59e0b" },
  { name: "Ringer", cat: "Crystalloids", color: "#22d3ee" },
]

export function fluidProfile(overrides: Partial<DoseProfile> = {}): DoseProfile {
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

export function pediatricFluidRule(
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
