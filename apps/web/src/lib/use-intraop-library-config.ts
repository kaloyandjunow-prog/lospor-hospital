"use client"

import { useMemo } from "react"
import {
  baseProfilesMap,
  concentrationsMap,
  defaultConcentrationMap,
  doseCalcMap,
  quickNumberMap,
  routeProfilesMap,
  routesMap,
  strictRangeMap,
  weightBasisMap,
} from "@lospor/core/option-library"
import { metadataNumber, metadataString } from "@lospor/core/option-contracts"
import {
  isClinicalRuleHidden,
  visibleClinicalOptions,
} from "@lospor/core/clinical-rules"
import type { WeightBasisMap } from "@/lib/infusion-calc"

/**
 * The intraoperative option libraries, turned into the lookup tables the
 * timetable draws from.
 *
 * Pure derivation — options in, configuration out. Lifted out of
 * `IntraopTimetable` as one hook rather than three because the three are one
 * job: everything the picker, the dose ranges, the routes and the
 * concentrations need, computed from the libraries and nothing else.
 *
 * No handler, no drag, no selection logic came with it. The memo bodies are
 * unchanged, dependency arrays included, so the recomputation behaviour is the
 * same as it was inside the component.
 */
export function useIntraopLibraryConfig({
  drugLibOpts,
  fluidLibOpts,
  infusionLibOpts,
}: {
  drugLibOpts: Parameters<typeof doseCalcMap>[0]
  fluidLibOpts: Parameters<typeof quickNumberMap>[0]
  infusionLibOpts: Parameters<typeof routesMap>[0]
}) {
  const { QUICK_DRUGS, HIDDEN_DRUGS, BOLUS_DOSES, BOLUS_CONFIGS, LA_CONCENTRATIONS, DRUG_ROUTES, QUICK_DOSES, BOLUS_ROUTE_PROFILES } = useMemo(() => {
    const byGroup = new Map<string, { cat: string; color: string; drugs: { name: string; unit: string }[] }>()
    const hiddenByGroup = new Map<string, { cat: string; color: string; drugs: { name: string; unit: string; manualEntryOnly: true }[] }>()
    // Only the picker hides ruleset-hidden drugs; the maps below stay complete so
    // a drug already recorded on the case keeps its units, codes and colour.
    for (const o of visibleClinicalOptions(drugLibOpts)) {
      const cat = o.group ?? "Other"
      if (!byGroup.has(cat)) byGroup.set(cat, { cat, color: o.color ?? "", drugs: [] })
      byGroup.get(cat)!.drugs.push({
        name: o.label,
        unit: metadataString(o.metadata, "unit") ?? "mg",
      })
    }
    // A hidden canonical drug is absent from routine scenarios, favourites and
    // browse lists, but exact search must still let a clinician document it.
    for (const o of drugLibOpts.filter(isClinicalRuleHidden)) {
      const cat = o.group ?? "Other"
      if (!hiddenByGroup.has(cat)) hiddenByGroup.set(cat, { cat, color: o.color ?? "", drugs: [] })
      hiddenByGroup.get(cat)!.drugs.push({
        name: o.label,
        unit: metadataString(o.metadata, "unit") ?? "mg",
        manualEntryOnly: true,
      })
    }
    return {
      QUICK_DRUGS: [...byGroup.values()],
      HIDDEN_DRUGS: [...hiddenByGroup.values()],
      BOLUS_DOSES: doseCalcMap(drugLibOpts),
      BOLUS_CONFIGS: strictRangeMap(drugLibOpts),
      LA_CONCENTRATIONS: concentrationsMap(drugLibOpts),
      DRUG_ROUTES: routesMap(drugLibOpts),
      QUICK_DOSES: quickNumberMap(drugLibOpts),
      BOLUS_ROUTE_PROFILES: routeProfilesMap(drugLibOpts),
    }
  }, [drugLibOpts])

  const {
    QUICK_FLUIDS,
    FLUID_QUICK_VOLUMES,
    FLUID_ROUTES,
    FLUID_CONCENTRATIONS,
    FLUID_DEFAULT_CONCENTRATIONS,
    FLUID_CONFIGS,
  } = useMemo(() => {
    const byGroup = new Map<string, { cat: string; color: string; fluids: { name: string }[] }>()
    const profiles = baseProfilesMap(fluidLibOpts)
    // As with drugs above: only the picker hides ruleset-hidden fluids, while
    // the maps below stay complete so a fluid already recorded on the case
    // keeps its volumes, routes and concentrations.
    for (const o of visibleClinicalOptions(fluidLibOpts)) {
      const cat = o.group ?? "Other"
      if (!byGroup.has(cat)) byGroup.set(cat, { cat, color: o.color ?? "", fluids: [] })
      byGroup.get(cat)!.fluids.push({ name: o.label })
    }
    return {
      QUICK_FLUIDS: [...byGroup.values()],
      FLUID_QUICK_VOLUMES: quickNumberMap(fluidLibOpts),
      FLUID_ROUTES: routesMap(fluidLibOpts),
      FLUID_CONCENTRATIONS: concentrationsMap(fluidLibOpts),
      FLUID_DEFAULT_CONCENTRATIONS: defaultConcentrationMap(fluidLibOpts),
      FLUID_CONFIGS: Object.fromEntries(fluidLibOpts.map(option => {
        const profile = profiles[option.label]
        return [option.label, {
          min: profile?.min ?? 0,
          max: profile?.max ?? 2000,
          step: profile?.step ?? 50,
          unit: profile?.unit ?? "mL",
          suggestedVolume: metadataNumber(option.metadata, "suggestedVolume"),
        }]
      })),
    }
  }, [fluidLibOpts])

  const { INFUSION_CONFIGS, INFUSION_WEIGHT_BASIS, INFUSION_ROUTES, QUICK_RATES, INFUSION_ROUTE_PROFILES } = useMemo(() => {
    const configs: Record<string, { units: string[]; min: number; max: number; step: number; color: string; suggestedRate?: number }> = {}
    const profiles = baseProfilesMap(infusionLibOpts)
    for (const o of infusionLibOpts) {
      const profile = profiles[o.label]
      configs[o.label] = {
        units: [profile?.unit ?? "mg/hr"],
        min: profile?.min ?? 0,
        max: profile?.max ?? 100,
        step: profile?.step ?? 1,
        color: o.color ?? "#64748b",
        suggestedRate: profile?.suggestedRate,
      }
    }
    const infusionWeightBasis: WeightBasisMap = Object.fromEntries(
      Object.entries(weightBasisMap(infusionLibOpts)).map(([name, basis]) => [
        name,
        basis === "IBW" || basis === "TBW" ? basis : "none",
      ]),
    )
    return {
      INFUSION_CONFIGS: configs,
      INFUSION_WEIGHT_BASIS: infusionWeightBasis,
      INFUSION_ROUTES: routesMap(infusionLibOpts),
      QUICK_RATES: quickNumberMap(infusionLibOpts),
      INFUSION_ROUTE_PROFILES: routeProfilesMap(infusionLibOpts),
    }
  }, [infusionLibOpts])

  return {
    QUICK_DRUGS, HIDDEN_DRUGS, BOLUS_DOSES, BOLUS_CONFIGS,
    LA_CONCENTRATIONS, DRUG_ROUTES, QUICK_DOSES, BOLUS_ROUTE_PROFILES,
    QUICK_FLUIDS, FLUID_QUICK_VOLUMES, FLUID_ROUTES, FLUID_CONCENTRATIONS,
    FLUID_DEFAULT_CONCENTRATIONS, FLUID_CONFIGS,
    INFUSION_CONFIGS, INFUSION_WEIGHT_BASIS, INFUSION_ROUTES, QUICK_RATES,
    INFUSION_ROUTE_PROFILES,
  }
}
