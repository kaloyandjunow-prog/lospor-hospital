import {
  calculateFluidVolumeMl,
  calculatePediatricMaintenanceRateMlPerHour,
  FLUID_RATE_SLIDER,
  resolveFluidEntryModeProfile,
  resolvePediatricMaintenanceWeightKg,
  type FluidEntryMode,
  type ResolvedFluidEntryModeProfile,
} from "@lospor/core/intraop-fluids"
import type { ClinicalRuleProvenance, TimetableFluid } from "@/types/timetable"
import {
  applicablePediatricFluidProfiles,
  type PediatricFluidProfileRule,
} from "@lospor/core/clinical-rules"
import type { DoseProfile } from "@lospor/core/catalog"

export type FluidSelectorDefaults = {
  availableModes: FluidEntryMode[]
  defaultMode: FluidEntryMode
  rate: string
  rateHint?: string
  rateProfile: ResolvedFluidEntryModeProfile["fluidRate"]
}

export type PediatricFluidProfileSelection = {
  profile: PediatricFluidProfileRule | null
  applicableCount: number
  conflict: boolean
}

export type FluidDoseSelectorSurface = {
  min: number
  max: number
  step: number
  quickValues: number[]
  unit: string
  routes: string[]
  route: string
  concentrationOptions: string[]
  defaultConcentration?: string
  suggestedVolume: number
}

export type FluidDoseSelectorFallback = Omit<
  FluidDoseSelectorSurface,
  "route" | "suggestedVolume"
> & {
  suggestedVolume?: number
}

export type FluidClinicalRuleAuditInput = {
  ruleKey?: string
  ruleVersion?: string
  sourceIds?: readonly string[]
  presetId?: string | null
  presetVersion?: number | null
  presetScope?: ClinicalRuleProvenance["clinicalPresetScope"] | null
}

export function fluidClinicalRuleAudit(
  input: FluidClinicalRuleAuditInput,
): ClinicalRuleProvenance {
  const preset = input.presetId && input.presetVersion != null && input.presetScope
    ? {
        clinicalPresetId: input.presetId,
        clinicalPresetVersion: input.presetVersion,
        clinicalPresetScope: input.presetScope,
      }
    : {}
  return {
    clinicalRuleKey: input.ruleKey,
    clinicalRuleVersion: input.ruleVersion,
    clinicalRuleSourceIds: input.sourceIds ? [...input.sourceIds] : undefined,
    ...preset,
  }
}

export function selectApplicablePediatricFluidProfile(input: {
  itemKey: string
  age: Parameters<typeof applicablePediatricFluidProfiles>[0]["age"]
  profiles: readonly PediatricFluidProfileRule[]
}): PediatricFluidProfileSelection {
  const applicable = applicablePediatricFluidProfiles(input)
  return {
    profile: applicable.length === 1 ? applicable[0] : null,
    applicableCount: applicable.length,
    conflict: applicable.length > 1,
  }
}

export function resolveFluidDoseSelectorSurface(input: {
  profile?: DoseProfile | null
  route?: string | null
  fallback: FluidDoseSelectorFallback
}): FluidDoseSelectorSurface {
  const profile = input.profile
  const routes = profile?.routes.length ? [...profile.routes] : [...input.fallback.routes]
  const route = input.route && routes.includes(input.route)
    ? input.route
    : profile?.defaultRoute && routes.includes(profile.defaultRoute)
      ? profile.defaultRoute
      : routes[0] ?? "IV"
  const routeProfile = profile?.routeModes?.[route]
  const quickValues = profile
    ? [...(routeProfile?.quickValues ?? profile.quickValues)]
    : [...input.fallback.quickValues]
  const concentrationOptions = profile
    ? [...(routeProfile?.concentrationOptions ?? profile.concentrationOptions ?? [])]
    : [...input.fallback.concentrationOptions]
  const defaultConcentration = routeProfile?.defaultConcentration
    ?? profile?.defaultConcentration
    ?? (!profile ? input.fallback.defaultConcentration : undefined)
  const min = routeProfile?.min ?? profile?.min ?? input.fallback.min
  const max = routeProfile?.max ?? profile?.max ?? input.fallback.max
  const step = routeProfile?.step ?? profile?.step ?? input.fallback.step
  const unit = routeProfile?.unit ?? profile?.unit ?? input.fallback.unit
  const suggestedVolume = routeProfile?.suggestedVolume
    ?? profile?.suggestedVolumeByRoute?.[route]
    ?? profile?.suggestedVolume
    ?? quickValues[0]
    ?? input.fallback.suggestedVolume
    ?? min

  return {
    min,
    max,
    step,
    quickValues,
    unit,
    routes,
    route,
    concentrationOptions,
    defaultConcentration,
    suggestedVolume,
  }
}

export function resolveFluidSelectorDefaults(input: {
  clinicalMode: "ADULT" | "PEDIATRIC"
  name: string
  category?: string | null
  concentration?: string | null
  profile?: DoseProfile | null
  totalBodyWeightKg?: number | null
  mclarenIdealBodyWeightKg?: number | null
  useIdealBodyWeight?: boolean
}): FluidSelectorDefaults {
  const profile = resolveFluidEntryModeProfile({
    clinicalMode: input.clinicalMode,
    name: input.name,
    category: input.category,
    concentration: input.concentration,
    profile: input.profile,
  })
  const maintenanceWeight = resolvePediatricMaintenanceWeightKg({
    totalBodyWeightKg: input.totalBodyWeightKg,
    mclarenIdealBodyWeightKg: input.mclarenIdealBodyWeightKg,
    useIdealBodyWeight: input.useIdealBodyWeight,
  })
  const calculatedRate = input.clinicalMode === "PEDIATRIC"
    && profile.fluidRate.calculation === "HOLLIDAY_SEGAR_4_2_1"
    && maintenanceWeight != null
      ? calculatePediatricMaintenanceRateMlPerHour(maintenanceWeight)
      : null
  const calculationBasis = input.useIdealBodyWeight ? "McLaren IBW" : "TBW"
  const rateProfile: ResolvedFluidEntryModeProfile["fluidRate"] = {
    ...profile.fluidRate,
    min: FLUID_RATE_SLIDER.min,
    max: FLUID_RATE_SLIDER.max,
    step: FLUID_RATE_SLIDER.step,
    allowManualOutsideRange: true,
  }

  return {
    availableModes: profile.fluidEntryModes,
    defaultMode: profile.defaultFluidEntryMode,
    rate: calculatedRate == null ? "" : String(calculatedRate),
    rateProfile,
    ...(profile.fluidRate.calculation === "HOLLIDAY_SEGAR_4_2_1"
      ? calculatedRate == null
        ? { rateHint: "Enter weight in preop to calculate the 4/2/1 rate." }
        : { rateHint: `4/2/1 · ${calculationBasis} ${Math.round((maintenanceWeight ?? 0) * 10) / 10} kg` }
      : {}),
  }
}

export function fluidDeliveredVolumeMl(
  fluid: TimetableFluid,
  asOf: Date | string | number = new Date(),
): number {
  return calculateFluidVolumeMl({
    fluidEntryMode: fluid.fluidEntryMode,
    bagVolumeMl: fluid.bagVolumeMl,
    administeredVolumeMl: fluid.administeredVolumeMl,
    legacyVolume: fluid.volume,
    startTs: fluid.startTs,
    endTs: fluid.endTs ?? asOf,
    rate: fluid.rate,
    rateChanges: fluid.rateChanges,
  })
}

export function currentFluidRate(fluid: TimetableFluid): number | null {
  if (fluid.fluidEntryMode !== "RATE") return null
  const baseRate = Number(fluid.rate)
  let current = Number.isFinite(baseRate) ? baseRate : null
  const orderedChanges = [...(fluid.rateChanges ?? [])]
    .map((change, index) => ({ change, index, time: Date.parse(change.ts) }))
    .filter(item => Number.isFinite(item.time))
    .sort((left, right) => left.time - right.time || left.index - right.index)
  for (const { change } of orderedChanges) {
    const rate = Number(change.rate)
    if (Number.isFinite(rate)) current = rate
  }
  return current
}
