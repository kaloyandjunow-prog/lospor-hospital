import { useMemo } from "react"
import { useOptionLibrary, type LibraryOption } from "@/lib/use-option-library"
import {
  quickNumberMap, quickStringMap, routesMap, concentrationsMap, defaultConcentrationMap,
  suggestedRateMap, strictRangeMap, defaultedRangeMap, routeProfilesMap, baseProfilesMap,
  doseCalcMap, codesMap, groupDrugCategories, groupClinicalEvents,
} from "@/lib/intraop-library"
import { MOBILE_DRUG_CAT_COLOR, MOBILE_FLUID_CAT_COLOR, MOBILE_AGENT_COLOR } from "@/lib/intraop-constants"
import { metadataString } from "@lospor/core/option-contracts"

// Loads the intraop drug/infusion/fluid/agent/event OptionLibrary categories and
// derives every lookup map + colour/range helper the screen needs. Extracted
// from cases/intraop/[id].tsx so all the option wiring lives in one place.
export function useIntraopOptions() {
  const { options: drugLibOpts } = useOptionLibrary("INTRAOP_DRUG")
  const { options: infusionLibOpts } = useOptionLibrary("INTRAOP_INFUSION")
  const { options: fluidLibOpts } = useOptionLibrary("INTRAOP_FLUID")
  const { options: agentLibOpts } = useOptionLibrary("INHALATIONAL_AGENT")
  const { options: eventLibOpts } = useOptionLibrary("INTRAOP_EVENT")

  const DRUG_CATS = useMemo(() => groupDrugCategories(drugLibOpts, cat => MOBILE_DRUG_CAT_COLOR[cat] ?? "#64748b"), [drugLibOpts])
  function drugColor(name: string): string {
    for (const cat of DRUG_CATS) {
      if (cat.drugs.some(d => d.name === name)) return cat.color
    }
    return "#64748b"
  }
  const INF_DRUGS = useMemo(() =>
    infusionLibOpts.map((o: LibraryOption) => ({
      name: o.label,
      unit: metadataString(o.metadata, "unit")
        ?? metadataString(o.metadata, "defaultUnit")
        ?? "mcg/kg/min",
      color: o.color ?? "#64748b",
    })),
  [infusionLibOpts])
  const FLUID_LIST = useMemo(() =>
    fluidLibOpts.map((o: LibraryOption) => ({ name: o.label, cat: o.group ?? "Other", color: MOBILE_FLUID_CAT_COLOR[o.group ?? "Other"] ?? "#94a3b8" })),
  [fluidLibOpts])
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
  const DRUG_ROUTE_PROFILES = useMemo(() => routeProfilesMap(drugLibOpts), [drugLibOpts])
  const DRUG_BASE_PROFILES = useMemo(() => baseProfilesMap(drugLibOpts), [drugLibOpts])
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
  }
}
