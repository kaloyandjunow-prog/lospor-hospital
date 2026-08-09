import { useMemo } from "react"
import { useOptionLibrary, type LibraryOption } from "@/lib/use-option-library"
import {
  quickNumberMap, quickStringMap, routesMap, concentrationsMap, defaultConcentrationMap,
  suggestedRateMap, strictRangeMap, defaultedRangeMap, routeProfilesMap, baseProfilesMap,
  drugRouteProfilesMap, drugBaseProfilesMap,
  doseCalcMap, codesMap, groupDrugCategories, groupClinicalEvents,
} from "@/lib/intraop-library"
import { MOBILE_DRUG_CAT_COLOR, MOBILE_FLUID_CAT_COLOR, MOBILE_AGENT_COLOR } from "@/lib/intraop-constants"
import { metadataString } from "@lospor/core/option-contracts"
import {
  applyAdultDoseProfilesToOptions,
  applyPediatricDrugProfilesToOptions,
  applyPediatricInfusionProfilesToOptions,
  visibleClinicalOptions,
  type AdultDoseProfileRule,
  type PediatricDrugProfileRule,
  type PediatricFluidProfileRule,
  type PediatricInfusionProfileRule,
} from "@lospor/core/clinical-rules"
import type { PediatricAgeInput } from "@lospor/core/pediatric"

// Loads the intraop drug/infusion/fluid/agent/event OptionLibrary categories and
// derives every lookup map + colour/range helper the screen needs. Extracted
// from cases/intraop/[id].tsx so all the option wiring lives in one place.
export function useIntraopOptions(
  adultDoseProfiles: readonly AdultDoseProfileRule[] = [],
  pediatricDrugProfiles: readonly PediatricDrugProfileRule[] = [],
  pediatricFluidProfiles: readonly PediatricFluidProfileRule[] = [],
  pediatricInfusionProfiles: readonly PediatricInfusionProfileRule[] = [],
  // Pediatric bands are patient-specific, so availability can only be applied
  // to the pickers once we know the patient's age (and weight for weight bands).
  patientAge: PediatricAgeInput | null = null,
  patientWeightKg: number | null = null,
) {
  const { options: baseDrugLibOpts } = useOptionLibrary("INTRAOP_DRUG")
  const { options: baseInfusionLibOpts } = useOptionLibrary("INTRAOP_INFUSION")
  const { options: baseFluidLibOpts } = useOptionLibrary("INTRAOP_FLUID")
  const { options: agentLibOpts } = useOptionLibrary("INHALATIONAL_AGENT")
  const { options: eventLibOpts } = useOptionLibrary("INTRAOP_EVENT")
  const drugOptionsWithPediatricRules = useMemo(() => {
    const known = new Set(baseDrugLibOpts.flatMap(option => [option.value, option.label]
      .map(value => value.trim().toUpperCase())))
    const synthetic = pediatricDrugProfiles.flatMap(rule => {
      // Never surface a band the ruleset hides — it would reappear as a new row.
      if ((rule.availability ?? "AUTO") === "HIDDEN") return []
      const keys = [rule.medicationKey, rule.labelEn].map(value => value.trim().toUpperCase())
      if (keys.some(key => known.has(key))) return []
      keys.forEach(key => known.add(key))
      return [{
        id: `pediatric-rule:${rule.ruleKey}`,
        value: rule.medicationKey,
        label: rule.labelEn || rule.medicationKey,
        labelBg: rule.labelBg,
        group: rule.category ?? "Other",
        parentId: null,
        color: null,
        description: null,
        drugId: null,
        atcCode: null,
        inn: rule.inn,
        metadata: {
          unit: rule.profile?.unit ?? rule.unit?.display ?? rule.manualUnit ?? "mg",
          routes: [...(rule.profile?.routes ?? ["IV"])],
        },
      } satisfies LibraryOption]
    })
    return [...baseDrugLibOpts, ...synthetic]
  }, [baseDrugLibOpts, pediatricDrugProfiles])
  const drugLibOpts = useMemo(
    () => applyPediatricDrugProfilesToOptions(
      applyAdultDoseProfilesToOptions(
        drugOptionsWithPediatricRules,
        adultDoseProfiles,
        "ADULT_DRUG_PROFILE",
      ),
      pediatricDrugProfiles,
      patientAge,
      patientWeightKg,
    ),
    [adultDoseProfiles, drugOptionsWithPediatricRules, pediatricDrugProfiles, patientAge, patientWeightKg],
  )
  const infusionLibOpts = useMemo(
    () => applyPediatricInfusionProfilesToOptions(
      applyAdultDoseProfilesToOptions(
        baseInfusionLibOpts,
        adultDoseProfiles,
        "ADULT_INFUSION_PROFILE",
      ),
      pediatricInfusionProfiles,
      patientAge,
      patientWeightKg,
    ),
    [adultDoseProfiles, baseInfusionLibOpts, pediatricInfusionProfiles, patientAge, patientWeightKg],
  )
  const fluidLibOpts = useMemo(
    () => applyAdultDoseProfilesToOptions(
      baseFluidLibOpts,
      adultDoseProfiles,
      "ADULT_FLUID_PROFILE",
    ),
    [adultDoseProfiles, baseFluidLibOpts],
  )
  const adultFluidProfileByKey = useMemo(() => {
    const profiles = new Map<string, AdultDoseProfileRule["profile"]>()
    for (const rule of adultDoseProfiles) {
      if (rule.kind !== "ADULT_FLUID_PROFILE") continue
      for (const key of [rule.itemKey, rule.labelEn]) {
        profiles.set(key.trim().toUpperCase(), rule.profile)
      }
    }
    return profiles
  }, [adultDoseProfiles])

  // Only the picker is trimmed. Every lookup map below keeps hidden entries so a
  // drug already recorded on the case retains its units, codes and colour.
  const DRUG_CATS = useMemo(
    () => groupDrugCategories(
      visibleClinicalOptions(drugLibOpts),
      cat => MOBILE_DRUG_CAT_COLOR[cat] ?? "#64748b",
    ),
    [drugLibOpts],
  )
  function drugColor(name: string): string {
    for (const cat of DRUG_CATS) {
      if (cat.drugs.some(d => d.name === name)) return cat.color
    }
    return "#64748b"
  }
  const INF_DRUGS = useMemo(() =>
    visibleClinicalOptions(infusionLibOpts).map((o: LibraryOption) => ({
      name: o.label,
      unit: metadataString(o.metadata, "unit")
        ?? metadataString(o.metadata, "defaultUnit")
        ?? "mcg/kg/min",
      color: o.color ?? "#64748b",
    })),
  [infusionLibOpts])
  // Picker only; the FLUID_* maps below deliberately keep hidden entries.
  const FLUID_LIST = useMemo(() =>
    visibleClinicalOptions(fluidLibOpts).map((o: LibraryOption) => ({
      name: o.label,
      cat: o.group ?? "Other",
      color: MOBILE_FLUID_CAT_COLOR[o.group ?? "Other"] ?? "#94a3b8",
      profile: adultFluidProfileByKey.get(o.label.trim().toUpperCase())
        ?? adultFluidProfileByKey.get(o.value.trim().toUpperCase()),
    })),
  [adultFluidProfileByKey, fluidLibOpts])
  const FLUID_QUICK_VOLUMES = useMemo(() => quickNumberMap(fluidLibOpts), [fluidLibOpts])
  const FLUID_CONCENTRATIONS = useMemo(() => concentrationsMap(fluidLibOpts), [fluidLibOpts])
  const FLUID_DEFAULT_CONCENTRATIONS = useMemo(() => defaultConcentrationMap(fluidLibOpts), [fluidLibOpts])
  const VOLATILE_AGENTS = useMemo(() =>
    agentLibOpts.map((o: LibraryOption) => ({ name: o.label, color: MOBILE_AGENT_COLOR[o.label] ?? "#a855f7" })),
  [agentLibOpts])

  // Dose presets, routes, concentrations, per-route profiles, dose calcs, and
  // coded identity all read from OptionLibrary metadata via the unit-tested
  // builders in src/lib/intraop-library.ts.
  const DRUG_QUICK_DOSES = useMemo(() => quickNumberMap(drugLibOpts), [drugLibOpts])
  const DRUG_ROUTES = useMemo(() => routesMap(drugLibOpts), [drugLibOpts])
  const DRUG_LA_CONCENTRATIONS = useMemo(() => concentrationsMap(drugLibOpts), [drugLibOpts])
  const DRUG_ROUTE_PROFILES = useMemo(() => drugRouteProfilesMap(drugLibOpts), [drugLibOpts])
  const DRUG_BASE_PROFILES = useMemo(() => drugBaseProfilesMap(drugLibOpts), [drugLibOpts])
  const DRUG_RANGES = useMemo(() => strictRangeMap(drugLibOpts), [drugLibOpts])
  const DRUG_DOSE_CALCS = useMemo(() => doseCalcMap(drugLibOpts), [drugLibOpts])
  function drugRange(name: string, unit: string) {
    if (DRUG_RANGES[name]) return DRUG_RANGES[name]
    if (unit === "mcg") return { min: 0, max: 2000, step: 10 }
    if (unit === "g")   return { min: 0, max: 10,   step: 0.5 }
    if (unit === "ml")  return { min: 0, max: 100,  step: 1 }
    if (unit === "IU")  return { min: 0, max: 200,  step: 5 }
    return { min: 0, max: 500, step: 5 }
  }
  const INFUSION_QUICK_RATES = useMemo(() => quickStringMap(infusionLibOpts), [infusionLibOpts])
  const INFUSION_SUGGESTED_RATES = useMemo(() => suggestedRateMap(infusionLibOpts), [infusionLibOpts])
  const INFUSION_ROUTES = useMemo(() => routesMap(infusionLibOpts), [infusionLibOpts])
  const INFUSION_LA_CONCENTRATIONS = useMemo(() => concentrationsMap(infusionLibOpts), [infusionLibOpts])
  const INFUSION_RANGES = useMemo(() => defaultedRangeMap(infusionLibOpts), [infusionLibOpts])
  function infusionRange(name: string) {
    return INFUSION_RANGES[name] ?? { min: 0, max: 100, step: 1 }
  }
  const INFUSION_ROUTE_PROFILES = useMemo(() => routeProfilesMap(infusionLibOpts), [infusionLibOpts])
  const INFUSION_BASE_PROFILES = useMemo(() => baseProfilesMap(infusionLibOpts), [infusionLibOpts])
  const DRUG_CODES = useMemo(() => codesMap(drugLibOpts), [drugLibOpts])
  const INFUSION_CODES = useMemo(() => codesMap(infusionLibOpts), [infusionLibOpts])
  const AGENT_QUICK_PERCENTS = useMemo(() => quickNumberMap(agentLibOpts), [agentLibOpts])

  const CLINICAL_EVENT_CATS = useMemo(() => groupClinicalEvents(eventLibOpts), [eventLibOpts])
  function clinicalEventColor(label: string): string {
    for (const cat of CLINICAL_EVENT_CATS) {
      const ev = cat.events.find(e => label === e.label || label.startsWith(e.label + " (") || label.startsWith(e.label))
      if (ev) return ev.color
    }
    return "#64748b"
  }

  return {
    drugLibOpts, infusionLibOpts, fluidLibOpts, agentLibOpts, eventLibOpts,
    DRUG_CATS, drugColor, INF_DRUGS, FLUID_LIST, FLUID_QUICK_VOLUMES, FLUID_CONCENTRATIONS,
    FLUID_DEFAULT_CONCENTRATIONS, VOLATILE_AGENTS, DRUG_QUICK_DOSES, DRUG_ROUTES,
    DRUG_LA_CONCENTRATIONS, DRUG_ROUTE_PROFILES, DRUG_BASE_PROFILES, DRUG_RANGES,
    DRUG_DOSE_CALCS, drugRange, INFUSION_QUICK_RATES, INFUSION_SUGGESTED_RATES,
    INFUSION_ROUTES, INFUSION_LA_CONCENTRATIONS, INFUSION_RANGES, infusionRange,
    INFUSION_ROUTE_PROFILES, INFUSION_BASE_PROFILES, DRUG_CODES, INFUSION_CODES,
    AGENT_QUICK_PERCENTS, CLINICAL_EVENT_CATS, clinicalEventColor,
    PEDIATRIC_DRUG_PROFILES: pediatricDrugProfiles,
    PEDIATRIC_FLUID_PROFILES: pediatricFluidProfiles,
    PEDIATRIC_INFUSION_PROFILES: pediatricInfusionProfiles,
  }
}
