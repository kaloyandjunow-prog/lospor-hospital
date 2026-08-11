import { View, Text, TouchableOpacity } from "react-native"
import { Sheet } from "@/components/intraop/Sheet"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import { displayClinicalCode } from "@/lib/clinical-display"
import {
  calculatePediatricMaintenanceRateMlPerHour,
  FLUID_RATE_SLIDER,
  resolveFluidEntryModeProfile,
  resolvePediatricMaintenanceWeightKg,
} from "@/lib/fluid-entry"
import type { FluidEntryMode } from "@/lib/intraop-log-event"
import { usePreferences } from "@/lib/preferences-context"
import {
  applicablePediatricFluidProfiles,
  selectApplicablePediatricFluidProfile,
  type PediatricFluidProfileRule,
} from "@lospor/core/clinical-rules"
import { resolveDrugSelectionSurface } from "@lospor/core/drug-selection"
import { canonicalizeDoseProfile } from "@lospor/core/clinical-rule-vocabulary"
import type { PediatricAgeInput } from "@lospor/core/pediatric"
import type { DoseProfile } from "@lospor/core/catalog"

type FluidOption = { name: string; cat: string; color: string; profile?: DoseProfile }

function suggestedBagVolume(
  profile: DoseProfile,
  surface: ReturnType<typeof resolveDrugSelectionSurface>,
): number | undefined {
  const canonical = canonicalizeDoseProfile(profile)
  return canonical.routeModes?.[surface.route]?.suggestedVolume
    ?? canonical.suggestedVolumeByRoute?.[surface.route]
    ?? canonical.suggestedVolume
    ?? surface.quickValues[0]
}

export function FluidSheet({
  visible, onClose, fluidList, flFluid, setFlFluid, flVol, setFlVol, onConfirm,
  flEntryMode, setFlEntryMode, flRate, setFlRate, patientWeightKg,
  quickVolumes = {}, routes = {}, flRoute, setFlRoute,
  concentrations = {}, defaultConcentrations = {}, flConcentration, setFlConcentration, pediatricMode = false,
  pediatricFluidProfiles = [], patientAge, setFlRule,
}: {
  visible: boolean
  onClose: () => void
  fluidList: FluidOption[]
  flFluid: FluidOption | null
  setFlFluid: (f: FluidOption) => void
  flVol: string
  setFlVol: (v: string) => void
  flEntryMode: FluidEntryMode
  setFlEntryMode: (mode: FluidEntryMode) => void
  flRate: string
  setFlRate: (rate: string) => void
  patientWeightKg?: number
  onConfirm: () => void
  quickVolumes?: Record<string, number[]>
  routes?: Record<string, string[]>
  flRoute?: string
  setFlRoute?: (r: string | undefined) => void
  concentrations?: Record<string, string[]>
  defaultConcentrations?: Record<string, string>
  flConcentration?: string
  setFlConcentration?: (c: string | undefined) => void
  pediatricMode?: boolean
  pediatricFluidProfiles?: readonly PediatricFluidProfileRule[]
  patientAge?: PediatricAgeInput | null
  setFlRule?: (rule: Pick<PediatricFluidProfileRule, "ruleKey" | "ruleVersion" | "sourceIds"> | null) => void
}) {
  const { tc, language } = usePreferences()
  const fluidLabel = (name: string) => displayClinicalCode("option:INTRAOP_FLUID", name, language, { label: name })
  const groupLabel = (name: string) => displayClinicalCode("optionGroup", name, language, { label: name })

  function applicableRules(fluid: FluidOption): PediatricFluidProfileRule[] {
    if (!pediatricMode) return []
    return applicablePediatricFluidProfiles({
      itemKey: fluid.name,
      age: patientAge ?? null,
      profiles: pediatricFluidProfiles,
    })
  }

  // The one-or-nothing rule comes from core, so the chart applies the same one.
  const selectedSelection = flFluid
    ? selectApplicablePediatricFluidProfile({
        itemKey: flFluid.name,
        age: patientAge ?? null,
        profiles: pediatricFluidProfiles,
      })
    : { profile: null, applicableCount: 0, conflict: false }
  const selectedRule = selectedSelection.profile
  const selectedRuleConflict = selectedSelection.conflict
  const selectedAuthoredProfile = pediatricMode ? selectedRule?.profile : flFluid?.profile
  const selectedSurface = selectedAuthoredProfile
    ? resolveDrugSelectionSurface({ profile:selectedAuthoredProfile, route:flRoute })
    : null
  const selectedProfile = flFluid && !selectedRuleConflict ? resolveFluidEntryModeProfile({
    clinicalMode: pediatricMode ? "PEDIATRIC" : "ADULT",
    name: flFluid.name,
    category: flFluid.cat,
    concentration: flConcentration,
    profile: selectedAuthoredProfile,
  }) : null

  function suggestedMaintenanceRate(
    fluid: FluidOption,
    concentration?: string,
    rule: PediatricFluidProfileRule | null = null,
  ): string {
    const profile = resolveFluidEntryModeProfile({
      clinicalMode: pediatricMode ? "PEDIATRIC" : "ADULT",
      name: fluid.name,
      category: fluid.cat,
      concentration,
      profile: rule?.profile,
    })
    if (profile.fluidRate.calculation !== "HOLLIDAY_SEGAR_4_2_1") return ""
    const weight = resolvePediatricMaintenanceWeightKg({
      totalBodyWeightKg: patientWeightKg,
      useIdealBodyWeight: false,
    })
    if (weight == null) return ""
    return String(calculatePediatricMaintenanceRateMlPerHour(weight) ?? "")
  }

  const selectFluid = (fluid: FluidOption) => {
    setFlFluid(fluid)
    const matchingRules = applicableRules(fluid)
    if (matchingRules.length > 1) {
      setFlVol("")
      setFlRate("")
      setFlConcentration?.(undefined)
      setFlRoute?.(undefined)
      setFlRule?.(null)
      return
    }
    const rule = matchingRules[0] ?? null
    const authoredProfile = pediatricMode ? rule?.profile : fluid.profile
    const surface = authoredProfile
      ? resolveDrugSelectionSurface({ profile:authoredProfile })
      : null
    const preset = surface && authoredProfile
      ? suggestedBagVolume(authoredProfile, surface)
      : (quickVolumes[fluid.name] ?? [250, 500, 1000])[0]
    setFlVol(preset == null ? "" : String(preset))
    const concentration = surface
      ? surface.concentration || undefined
      : defaultConcentrations[fluid.name]
    setFlConcentration?.(concentration)
    const route = surface?.route ?? routes[fluid.name]?.[0]
    setFlRoute?.(route)
    setFlRule?.(rule ? {
      ruleKey:rule.ruleKey,
      ruleVersion:rule.ruleVersion,
      sourceIds:[...rule.sourceIds],
    } : null)
    const profile = resolveFluidEntryModeProfile({
      clinicalMode: pediatricMode ? "PEDIATRIC" : "ADULT",
      name: fluid.name,
      category: fluid.cat,
      concentration,
      profile: authoredProfile,
    })
    setFlEntryMode(profile.defaultFluidEntryMode)
    setFlRate(profile.defaultFluidEntryMode === "RATE"
      ? suggestedMaintenanceRate(fluid, concentration, rule)
      : "")
  }

  function selectMode(mode: FluidEntryMode) {
    if (!flFluid || !selectedProfile?.fluidEntryModes.includes(mode)) return
    setFlEntryMode(mode)
    if (mode === "RATE" && !flRate) {
      setFlRate(suggestedMaintenanceRate(flFluid, flConcentration, selectedRule))
    }
  }

  function changeRoute(route: string) {
    setFlRoute?.(route)
    if (!flFluid || !selectedAuthoredProfile) return
    const surface = resolveDrugSelectionSurface({ profile:selectedAuthoredProfile, route })
    setFlRoute?.(surface.route)
    const suggestedVolume = suggestedBagVolume(selectedAuthoredProfile, surface)
    setFlVol(suggestedVolume == null ? "" : String(suggestedVolume))
    const concentration = surface.concentration || undefined
    setFlConcentration?.(concentration)
    if (flEntryMode === "RATE") {
      setFlRate(suggestedMaintenanceRate(flFluid, concentration, selectedRule))
    }
  }

  function changeConcentration(concentration: string | undefined) {
    const resolved = concentration ?? (selectedAuthoredProfile
      ? selectedSurface?.concentration || undefined
      : flFluid ? defaultConcentrations[flFluid.name] : undefined)
    setFlConcentration?.(resolved)
    if (flFluid && flEntryMode === "RATE") {
      // Concentration can change whether this is a maintenance-compatible
      // product (notably 0.9% versus 3%/20% saline).
      setFlRate(suggestedMaintenanceRate(flFluid, resolved, selectedRule))
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={`${tc("dsAdd")} ${tc("trRowFluid")}`}>
      {flFluid && (
        <View style={{ marginBottom:16 }}>
          {selectedRuleConflict ? (
            <Text
              testID="fluid-profile-conflict"
              accessibilityRole="alert"
              style={{ color:"#fca5a5", fontSize:12, lineHeight:17, marginBottom:10 }}
            >
              Overlapping pediatric fluid rules apply at this age. This fluid cannot be added until the rules are corrected.
            </Text>
          ) : (
            <>
          <View
            testID="fluid-entry-mode"
            accessibilityRole="tablist"
            style={{ flexDirection:"row", gap:8, marginBottom:14 }}
          >
            {(selectedProfile?.fluidEntryModes ?? ["VOLUME"]).map(mode => (
              <TouchableOpacity
                key={mode}
                testID={`fluid-mode-${mode}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: flEntryMode === mode }}
                onPress={() => selectMode(mode)}
                style={{ flex:1, alignItems:"center", borderRadius:10, paddingVertical:10,
                  backgroundColor: flEntryMode === mode ? flFluid.color : flFluid.color + "1a",
                  borderWidth:1, borderColor:flFluid.color + "66" }}
              >
                <Text style={{ color: flEntryMode === mode ? "#fff" : flFluid.color, fontSize:13, fontWeight:"700" }}>
                  {mode === "VOLUME" ? "Bag" : "Rate"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <DoseSelector
            color={flFluid.color}
            quickValues={flEntryMode === "VOLUME"
              ? selectedSurface?.quickValues ?? quickVolumes[flFluid.name] ?? [250, 500, 1000]
              : undefined}
            value={flEntryMode === "VOLUME" ? flVol : flRate}
            onValueChange={flEntryMode === "VOLUME" ? setFlVol : setFlRate}
            min={flEntryMode === "VOLUME" ? selectedSurface?.min ?? 0 : FLUID_RATE_SLIDER.min}
            max={flEntryMode === "VOLUME" ? selectedSurface?.max ?? 2000 : FLUID_RATE_SLIDER.max}
            manualMax={flEntryMode === "RATE" ? Number.MAX_SAFE_INTEGER : undefined}
            step={flEntryMode === "VOLUME" ? selectedSurface?.step ?? 50 : FLUID_RATE_SLIDER.step}
            valuePlaceholder={flEntryMode === "VOLUME" ? "Volume" : "Rate"}
            unitSuffix={flEntryMode === "VOLUME" ? "mL" : "mL/h"}
            routes={selectedSurface?.routes ?? routes[flFluid.name]}
            route={selectedSurface?.route ?? flRoute}
            onRouteChange={changeRoute}
            concentrationOptions={selectedSurface?.concentrationOptions ?? concentrations[flFluid.name]}
            concentration={flConcentration} onConcentrationChange={changeConcentration}
            confirmLabel={`${flEntryMode === "RATE" ? "Start" : tc("dsAdd")} ${fluidLabel(flFluid.name)} ${flEntryMode === "RATE" ? flRate : flVol} ${flEntryMode === "RATE" ? "mL/h" : "mL"}`}
            onConfirm={onConfirm}
            confirmDisabled={!(flEntryMode === "RATE" ? Number(flRate) > 0 : Number(flVol) > 0)}
          />
            </>
          )}
        </View>
      )}
      {(["Crystalloids","Colloids","Blood products","Other"] as const).map(cat => (
        <View key={cat} style={{ marginBottom:14 }}>
          <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase",
            letterSpacing:1, marginBottom:8 }}>{groupLabel(cat)}</Text>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
            {fluidList.filter(f => f.cat === cat).map(f => (
              <TouchableOpacity key={f.name} onPress={() => selectFluid(f)}
                style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:10,
                  backgroundColor: flFluid?.name===f.name ? f.color : f.color+"1a",
                  borderWidth:1, borderColor:f.color+"55" }}>
                <Text style={{ color: flFluid?.name===f.name ? "#fff" : f.color, fontSize:12, fontWeight:"600" }}>
                  {fluidLabel(f.name)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </Sheet>
  )
}
