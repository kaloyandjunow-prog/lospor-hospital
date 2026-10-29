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
import { weightBasisMap } from "@lospor/core/option-library"
import type { WeightBasisMap } from "@lospor/core/intraop-totals"
import {
  applyAdultDoseProfilesToOptions,
  applyPediatricDrugProfilesToOptions,
  applyPediatricInfusionProfilesToOptions,
  synthesizePediatricDrugOptions,
  visibleClinicalOptions,
  type AdultDoseProfileRule,
  type PediatricDrugProfileRule,
  type PediatricFluidProfileRule,
  type PediatricInfusionProfileRule,
} from "@lospor/core/clinical-rules"
import type { PediatricAgeInput } from "@lospor/core/pediatric"
import {
  hiddenDrugSearchOptions,
  hiddenInfusionSearchOptions,
  type ActiveClinicalPreset,
} from "@/lib/hidden-clinical-options"
import { useShade } from "@/theme/shade"
import { useThemeScheme } from "@/theme/theme-context"
import { currentDrugColors } from "@/lib/drug-colors"

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
  activePreset: ActiveClinicalPreset = null,
  prospectiveGuidanceEnabled = false,
) {
  const shade = useShade()
  const scheme = useThemeScheme()
  const { options: baseDrugLibOpts } = useOptionLibrary("INTRAOP_DRUG")
  const { options: baseInfusionLibOpts } = useOptionLibrary("INTRAOP_INFUSION")
  const { options: baseFluidLibOpts } = useOptionLibrary("INTRAOP_FLUID")
  const { options: agentLibOpts } = useOptionLibrary("INHALATIONAL_AGENT")
  const { options: eventLibOpts } = useOptionLibrary("INTRAOP_EVENT")
  const drugOptionsWithPediatricRules = useMemo(
    () => synthesizePediatricDrugOptions(baseDrugLibOpts, pediatricDrugProfiles),
    [baseDrugLibOpts, pediatricDrugProfiles],
  )
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

  // Each drug's colour now: the hospital's own (Status, 10.0.0), else the bundled one.
  const drugColors = useMemo(() => currentDrugColors(drugLibOpts, infusionLibOpts, scheme), [drugLibOpts, infusionLibOpts, scheme])
  const SEARCH_ONLY_DRUGS = useMemo(() => hiddenDrugSearchOptions({
    // A drug's own colour is a style class for the web; the phone takes its plain colour.
    options: drugLibOpts.map(option => ({ ...option, color: drugColors.drug(option.label) ?? null })),
    adultDoseProfiles,
    pediatricDrugProfiles,
    patientAge,
    patientWeightKg,
    activePreset,
    fallbackUnit: "mg",
    fallbackColor: option => MOBILE_DRUG_CAT_COLOR[option.group ?? "Other"] ?? shade("#64748b"),
  }), [activePreset, adultDoseProfiles, drugColors, drugLibOpts, patientAge, patientWeightKg, pediatricDrugProfiles, shade])
  const SEARCH_ONLY_INFUSIONS = useMemo(() => hiddenInfusionSearchOptions({
    options: infusionLibOpts.map(option => ({ ...option, color: drugColors.infusion(option.label) ?? option.color })),
    adultDoseProfiles,
    pediatricInfusionProfiles,
    patientAge,
    patientWeightKg,
    activePreset,
    fallbackUnit: "mcg/kg/min",
    fallbackColor: () => shade("#64748b"),
  }), [activePreset, adultDoseProfiles, drugColors, infusionLibOpts, patientAge, patientWeightKg, pediatricInfusionProfiles, shade])
  const searchOnlyInfusionNames = useMemo(
    () => new Set(SEARCH_ONLY_INFUSIONS.map(option => option.name)),
    [SEARCH_ONLY_INFUSIONS],
  )

  // Only the picker is trimmed. Every lookup map below keeps hidden entries so a
  // drug already recorded on the case retains its units, codes and colour.
  const DRUG_CATS = useMemo(
    () => groupDrugCategories(
      visibleClinicalOptions(drugLibOpts),
      // The group's colour, as the web shows it; the hospital's own if it chose one.
      drugColors.group,
    ).map(category => ({
      ...category,
      // A drug may have a colour of its own, apart from its group's.
      drugs: category.drugs.map(drug => ({ ...drug, color: drugColors.drug(drug.name) ?? category.color })),
    })),
    [drugColors, drugLibOpts],
  )
  function drugColor(name: string): string {
    return drugColors.drug(name) ?? shade("#64748b")
  }
  const INF_DRUGS = useMemo(() =>
    visibleClinicalOptions(infusionLibOpts)
      .filter(option => !searchOnlyInfusionNames.has(option.label))
      .map((o: LibraryOption) => ({
      name: o.label,
      unit: metadataString(o.metadata, "unit")
        ?? metadataString(o.metadata, "defaultUnit")
        ?? "mcg/kg/min",
      color: drugColors.infusion(o.label) ?? shade("#64748b"),
      group: o.group ?? undefined,
    })),
  [drugColors, infusionLibOpts, searchOnlyInfusionNames, shade])
  // Per-kg infusion totals must use the basis the institution configured, not
  // a hardcoded table. Web has always read this from the option library; the
  // phone used the static default, so an institution that changed a drug from
  // TBW to IBW got two different total doses for one timetable — and for a
  // heavy patient those differ by tens of kilograms of weight term.
  const INFUSION_WEIGHT_BASIS = useMemo<WeightBasisMap>(
    () => weightBasisMap(infusionLibOpts),
    [infusionLibOpts],
  )
  // Picker only; the FLUID_* maps below deliberately keep hidden entries.
  const FLUID_LIST = useMemo(() =>
    visibleClinicalOptions(fluidLibOpts).map((o: LibraryOption) => ({
      name: o.label,
      cat: o.group ?? "Other",
      color: MOBILE_FLUID_CAT_COLOR[o.group ?? "Other"] ?? shade("#94a3b8"),
      profile: prospectiveGuidanceEnabled
        ? adultFluidProfileByKey.get(o.label.trim().toUpperCase())
          ?? adultFluidProfileByKey.get(o.value.trim().toUpperCase())
        : undefined,
    })),
  [adultFluidProfileByKey, fluidLibOpts, prospectiveGuidanceEnabled, shade])
  const FLUID_QUICK_VOLUMES = useMemo(
    () => prospectiveGuidanceEnabled ? quickNumberMap(fluidLibOpts) : {},
    [fluidLibOpts, prospectiveGuidanceEnabled],
  )
  const FLUID_CONCENTRATIONS = useMemo(
    () => prospectiveGuidanceEnabled ? concentrationsMap(fluidLibOpts) : {},
    [fluidLibOpts, prospectiveGuidanceEnabled],
  )
  const FLUID_DEFAULT_CONCENTRATIONS = useMemo(
    () => prospectiveGuidanceEnabled ? defaultConcentrationMap(fluidLibOpts) : {},
    [fluidLibOpts, prospectiveGuidanceEnabled],
  )
  const FLUID_ROUTES = useMemo(() => routesMap(fluidLibOpts), [fluidLibOpts])
  const VOLATILE_AGENTS = useMemo(() =>
    agentLibOpts.map((o: LibraryOption) => ({ name: o.label, color: MOBILE_AGENT_COLOR[o.label] ?? shade("#a855f7") })),
  [agentLibOpts, shade])

  // Dose presets, routes, concentrations, per-route profiles, dose calcs, and
  // coded identity all read from OptionLibrary metadata via the unit-tested
  // builders in src/lib/intraop-library.ts.
  const DRUG_QUICK_DOSES = useMemo(
    () => prospectiveGuidanceEnabled ? quickNumberMap(drugLibOpts) : {},
    [drugLibOpts, prospectiveGuidanceEnabled],
  )
  const DRUG_ROUTES = useMemo(() => routesMap(drugLibOpts), [drugLibOpts])
  const DRUG_LA_CONCENTRATIONS = useMemo(
    () => prospectiveGuidanceEnabled ? concentrationsMap(drugLibOpts) : {},
    [drugLibOpts, prospectiveGuidanceEnabled],
  )
  const DRUG_ROUTE_PROFILES = useMemo(
    () => prospectiveGuidanceEnabled ? drugRouteProfilesMap(drugLibOpts) : {},
    [drugLibOpts, prospectiveGuidanceEnabled],
  )
  const DRUG_BASE_PROFILES = useMemo(
    () => prospectiveGuidanceEnabled ? drugBaseProfilesMap(drugLibOpts) : {},
    [drugLibOpts, prospectiveGuidanceEnabled],
  )
  const DRUG_RANGES = useMemo(
    () => prospectiveGuidanceEnabled ? strictRangeMap(drugLibOpts) : {},
    [drugLibOpts, prospectiveGuidanceEnabled],
  )
  const DRUG_DOSE_CALCS = useMemo(
    () => prospectiveGuidanceEnabled ? doseCalcMap(drugLibOpts) : {},
    [drugLibOpts, prospectiveGuidanceEnabled],
  )
  function drugRange(name: string, unit: string) {
    if (DRUG_RANGES[name]) return DRUG_RANGES[name]
    if (unit === "mcg") return { min: 0, max: 2000, step: 10 }
    if (unit === "g")   return { min: 0, max: 10,   step: 0.5 }
    if (unit === "ml")  return { min: 0, max: 100,  step: 1 }
    if (unit === "IU")  return { min: 0, max: 200,  step: 5 }
    return { min: 0, max: 500, step: 5 }
  }
  const INFUSION_QUICK_RATES = useMemo(
    () => prospectiveGuidanceEnabled ? quickStringMap(infusionLibOpts) : {},
    [infusionLibOpts, prospectiveGuidanceEnabled],
  )
  const INFUSION_SUGGESTED_RATES = useMemo(
    () => prospectiveGuidanceEnabled ? suggestedRateMap(infusionLibOpts) : {},
    [infusionLibOpts, prospectiveGuidanceEnabled],
  )
  const INFUSION_ROUTES = useMemo(() => routesMap(infusionLibOpts), [infusionLibOpts])
  const INFUSION_LA_CONCENTRATIONS = useMemo(
    () => prospectiveGuidanceEnabled ? concentrationsMap(infusionLibOpts) : {},
    [infusionLibOpts, prospectiveGuidanceEnabled],
  )
  const INFUSION_RANGES = useMemo(
    () => prospectiveGuidanceEnabled ? defaultedRangeMap(infusionLibOpts) : {},
    [infusionLibOpts, prospectiveGuidanceEnabled],
  )
  function infusionRange(name: string) {
    return INFUSION_RANGES[name] ?? { min: 0, max: 100, step: 1 }
  }
  const INFUSION_ROUTE_PROFILES = useMemo(
    () => prospectiveGuidanceEnabled ? routeProfilesMap(infusionLibOpts) : {},
    [infusionLibOpts, prospectiveGuidanceEnabled],
  )
  const INFUSION_BASE_PROFILES = useMemo(
    () => prospectiveGuidanceEnabled ? baseProfilesMap(infusionLibOpts) : {},
    [infusionLibOpts, prospectiveGuidanceEnabled],
  )
  const DRUG_CODES = useMemo(() => codesMap(drugLibOpts), [drugLibOpts])
  const INFUSION_CODES = useMemo(() => codesMap(infusionLibOpts), [infusionLibOpts])
  const AGENT_QUICK_PERCENTS = useMemo(
    () => prospectiveGuidanceEnabled ? quickNumberMap(agentLibOpts) : {},
    [agentLibOpts, prospectiveGuidanceEnabled],
  )

  const CLINICAL_EVENT_CATS = useMemo(() => groupClinicalEvents(eventLibOpts), [eventLibOpts])
  function clinicalEventColor(label: string): string {
    for (const cat of CLINICAL_EVENT_CATS) {
      const ev = cat.events.find(e => label === e.label || label.startsWith(e.label + " (") || label.startsWith(e.label))
      if (ev) return ev.color
    }
    return shade("#64748b")
  }

  return {
    drugLibOpts, infusionLibOpts, fluidLibOpts, agentLibOpts, eventLibOpts,
    SEARCH_ONLY_DRUGS, SEARCH_ONLY_INFUSIONS,
    DRUG_CATS, drugColor, drugColors, INF_DRUGS, INFUSION_WEIGHT_BASIS, FLUID_LIST, FLUID_QUICK_VOLUMES, FLUID_CONCENTRATIONS,
    FLUID_DEFAULT_CONCENTRATIONS, FLUID_ROUTES, VOLATILE_AGENTS, DRUG_QUICK_DOSES, DRUG_ROUTES,
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
