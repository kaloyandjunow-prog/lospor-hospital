import type { JsonObject } from "./option-contracts"
import {
  metadataBoolean,
  metadataNumber,
  metadataNumbers,
  metadataObject,
  metadataString,
  metadataStrings,
} from "./option-contracts"

export type LibraryOption = {
  id: string
  value: string
  label: string
  labelBg: string | null
  group: string | null
  parentId: string | null
  color: string | null
  description: string | null
  drugId: string | null
  atcCode: string | null
  inn: string | null
  metadata: JsonObject | null
}

export type RangeSpec = {
  min: number
  max: number
  step: number
  precision?: number
  unit: string
}

export function rangeSpecFromOption(
  option: Pick<LibraryOption, "metadata"> | null | undefined,
): RangeSpec | undefined {
  const metadata = option?.metadata
  const min = metadataNumber(metadata, "min")
  const max = metadataNumber(metadata, "max")
  const step = metadataNumber(metadata, "step")
  const unit = metadataString(metadata, "unit")
  if (min == null || max == null || step == null || unit == null) {
    return undefined
  }
  const precision = metadataNumber(metadata, "precision")
  return {
    min,
    max,
    step,
    unit,
    ...(precision != null ? { precision } : {}),
  }
}

export function metadataArray(option: LibraryOption, key: string): string[] {
  const value = option.metadata?.[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

export function metadataRecord<T>(option: LibraryOption, key: string): Record<string, T> {
  const value = option.metadata?.[key]
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, T> : {}
}

export function optionByLabel(options: LibraryOption[]): Record<string, LibraryOption> {
  return Object.fromEntries(options.map(option => [option.label, option]))
}

type Meta = JsonObject | null | undefined
const meta = (option: LibraryOption): Meta => option.metadata as Meta

export type RouteProfile = {
  mode?: string
  min: number
  max: number
  step: number
  quickValues: number[]
  unit: string
  concentrationOptions?: string[]
  concentrationUnit?: string
  defaultConcentration?: string
  formulationOptions?: Array<"HYPOBARIC" | "ISOBARIC" | "HYPERBARIC">
  defaultFormulation?: "HYPOBARIC" | "ISOBARIC" | "HYPERBARIC"
  suggestedRate?: number
  suggestedConcentration?: string
}

export type DoseCalcRule = {
  perKg?: number
  perM2?: number
  flat?: number
  basis?: "IBW" | "TBW" | "BSA_M2"
  roundTo?: number
  cap?: number
  capAtActualWeight?: boolean
}

export type DoseCalcEntry = DoseCalcRule & {
  hint: string
  byRoute?: Record<string, DoseCalcRule>
}

export type NumberRange = { min: number; max: number; step: number }

function doseRuleFrom(value: unknown): DoseCalcRule | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as JsonObject
  const rule: DoseCalcRule = {}
  const perKg = metadataNumber(record, "perKg")
  const perM2 = metadataNumber(record, "perM2")
  const flat = metadataNumber(record, "flat")
  const basis = metadataString(record, "basis")
  const roundTo = metadataNumber(record, "roundTo")
  const cap = metadataNumber(record, "cap")
  const capAtActualWeight = metadataBoolean(record, "capAtActualWeight")
  if (perKg != null) rule.perKg = perKg
  if (perM2 != null) rule.perM2 = perM2
  if (flat != null) rule.flat = flat
  if (basis === "IBW" || basis === "TBW" || basis === "BSA_M2") rule.basis = basis
  if (roundTo != null) rule.roundTo = roundTo
  if (cap != null) rule.cap = cap
  if (capAtActualWeight != null) rule.capAtActualWeight = capAtActualWeight
  return Object.keys(rule).length ? rule : undefined
}

export function quickNumberMap(options: LibraryOption[]): Record<string, number[]> {
  const map: Record<string, number[]> = {}
  for (const option of options) {
    const quickValues = metadataNumbers(meta(option), "quickValues")
    if (quickValues.length) map[option.label] = quickValues
  }
  return map
}

export function quickStringMap(options: LibraryOption[]): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const option of options) {
    const quickValues = meta(option)?.quickValues
    if (Array.isArray(quickValues) && quickValues.length) {
      map[option.label] = quickValues
        .filter(value => typeof value === "string" || typeof value === "number")
        .map(String)
    }
  }
  return map
}

export function routesMap(options: LibraryOption[]): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const option of options) {
    const routes = metadataStrings(meta(option), "routes")
    map[option.label] = routes.length ? routes : ["IV"]
  }
  return map
}

export function defaultRouteMap(options: LibraryOption[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const option of options) {
    const routes = metadataStrings(meta(option), "routes")
    map[option.label] = metadataString(meta(option), "defaultRoute") ?? routes[0] ?? "IV"
  }
  return map
}

export function concentrationsMap(options: LibraryOption[]): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const option of options) {
    const concentrations = metadataStrings(meta(option), "concentrationOptions")
    if (concentrations.length) map[option.label] = concentrations
  }
  return map
}

export function defaultConcentrationMap(options: LibraryOption[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const option of options) {
    const concentration = metadataString(meta(option), "defaultConcentration")
    if (concentration) map[option.label] = concentration
  }
  return map
}

export function suggestedRateMap(options: LibraryOption[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const option of options) {
    const rate = metadataNumber(meta(option), "suggestedRate")
    if (rate != null) map[option.label] = String(rate)
  }
  return map
}

type OptionWeightBasis = "IBW" | "TBW" | "BSA_M2" | "none"

export function weightBasisMap(
  options: LibraryOption[],
  fallback: OptionWeightBasis = "IBW",
): Record<string, OptionWeightBasis> {
  const map: Record<string, OptionWeightBasis> = {}
  for (const option of options) {
    const value = metadataString(meta(option), "weightBasis")
    map[option.label] = value === "IBW" || value === "TBW" || value === "BSA_M2" || value === "none"
      ? value
      : fallback
  }
  return map
}

export type OptionStyle = { bar: string; text: string; grip: string }

export function optionStyleMap(options: LibraryOption[]): Record<string, OptionStyle> {
  const map: Record<string, OptionStyle> = {}
  for (const option of options) {
    const metadata = meta(option)
    const bar = metadataString(metadata, "bar")
    const text = metadataString(metadata, "text")
    const grip = metadataString(metadata, "grip")
    if (bar && text && grip) map[option.label] = { bar, text, grip }
  }
  return map
}

export function strictRangeMap(options: LibraryOption[]): Record<string, NumberRange> {
  const map: Record<string, NumberRange> = {}
  for (const option of options) {
    const metadata = meta(option)
    const min = metadataNumber(metadata, "min")
    const max = metadataNumber(metadata, "max")
    const step = metadataNumber(metadata, "step")
    if (min != null && max != null && step != null) {
      map[option.label] = { min, max, step }
    }
  }
  return map
}

export function defaultedRangeMap(options: LibraryOption[]): Record<string, NumberRange> {
  const map: Record<string, NumberRange> = {}
  for (const option of options) {
    const metadata = meta(option)
    map[option.label] = {
      min: metadataNumber(metadata, "min") ?? 0,
      max: metadataNumber(metadata, "max") ?? 100,
      step: metadataNumber(metadata, "step") ?? 1,
    }
  }
  return map
}

function profileFrom(value: unknown): RouteProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const profile = value as JsonObject
  const min = metadataNumber(profile, "min")
  const max = metadataNumber(profile, "max")
  const unit = metadataString(profile, "unit")
  if (min == null || max == null || !unit) return null
  const variableStep = Array.isArray(profile.variableStep) && profile.variableStep.length
    && profile.variableStep[0] && typeof profile.variableStep[0] === "object"
    ? metadataNumber(profile.variableStep[0] as JsonObject, "step")
    : undefined
  const formulations = metadataStrings(profile, "formulationOptions")
    .map(value => value.toUpperCase())
    .filter((value): value is "HYPOBARIC" | "ISOBARIC" | "HYPERBARIC" =>
      value === "HYPOBARIC" || value === "ISOBARIC" || value === "HYPERBARIC",
    )
  const defaultFormulation = metadataString(profile, "defaultFormulation")?.toUpperCase()
  return {
    mode: metadataString(profile, "mode"),
    min,
    max,
    step: metadataNumber(profile, "step") ?? variableStep ?? 1,
    quickValues: metadataNumbers(profile, "quickValues"),
    unit,
    concentrationOptions: metadataStrings(profile, "concentrationOptions"),
    concentrationUnit: metadataString(profile, "concentrationUnit"),
    defaultConcentration: metadataString(profile, "defaultConcentration")
      ?? metadataString(profile, "suggestedConcentration"),
    formulationOptions: formulations.length ? formulations : undefined,
    defaultFormulation: defaultFormulation === "HYPOBARIC"
      || defaultFormulation === "ISOBARIC"
      || defaultFormulation === "HYPERBARIC"
      ? defaultFormulation
      : undefined,
    suggestedRate: metadataNumber(profile, "suggestedRate"),
    suggestedConcentration: metadataString(profile, "suggestedConcentration"),
  }
}

export function routeProfilesMap(options: LibraryOption[]): Record<string, Record<string, RouteProfile>> {
  const map: Record<string, Record<string, RouteProfile>> = {}
  for (const option of options) {
    const routeModes = metadataObject(meta(option), "routeModes")
    if (!routeModes) continue
    map[option.label] = {}
    for (const [route, profile] of Object.entries(routeModes)) {
      const routeProfile = profileFrom(profile)
      if (routeProfile) map[option.label][route] = routeProfile
    }
  }
  return map
}

export function baseProfilesMap(options: LibraryOption[]): Record<string, RouteProfile> {
  const map: Record<string, RouteProfile> = {}
  for (const option of options) {
    const profile = profileFrom(meta(option))
    if (profile) map[option.label] = profile
  }
  return map
}

export function doseCalcMap(options: LibraryOption[]): Record<string, DoseCalcEntry> {
  const map: Record<string, DoseCalcEntry> = {}
  for (const option of options) {
    const metadata = meta(option)
    const doseCalc = doseRuleFrom(metadata?.doseCalc)
    const byRoute: Record<string, DoseCalcRule> = {}
    const routeDoseCalculations = metadataObject(metadata, "doseCalcByRoute")
    if (routeDoseCalculations) {
      for (const [route, value] of Object.entries(routeDoseCalculations)) {
        const rule = doseRuleFrom(value)
        if (rule) byRoute[route] = rule
      }
    }
    const routeModes = metadataObject(metadata, "routeModes")
    if (routeModes) {
      for (const [route, value] of Object.entries(routeModes)) {
        const profile = value && typeof value === "object" && !Array.isArray(value)
          ? value as JsonObject
          : null
        const rule = doseRuleFrom(profile?.doseCalc)
        if (rule) byRoute[route] = rule
      }
    }
    const hasByRoute = Object.keys(byRoute).length > 0
    const hint = metadataString(metadata, "hint") ?? ""
    if (doseCalc || hint || hasByRoute) {
      map[option.label] = { hint, ...doseCalc, ...(hasByRoute ? { byRoute } : {}) }
    }
  }
  return map
}

export function codesMap(options: LibraryOption[]): Record<string, { drugId?: string; atcCode?: string; inn?: string }> {
  const map: Record<string, { drugId?: string; atcCode?: string; inn?: string }> = {}
  for (const option of options) {
    map[option.label] = {
      drugId: option.drugId ?? undefined,
      atcCode: option.atcCode ?? undefined,
      inn: option.inn ?? undefined,
    }
  }
  return map
}

export type DrugCategory = {
  cat: string
  color: string
  drugs: { name: string; unit: string }[]
}

export function groupDrugCategories(
  options: LibraryOption[],
  colorFor: (category: string) => string,
): DrugCategory[] {
  const byGroup = new Map<string, DrugCategory>()
  for (const option of options) {
    const category = option.group ?? "Other"
    if (!byGroup.has(category)) byGroup.set(category, { cat: category, color: colorFor(category), drugs: [] })
    byGroup.get(category)!.drugs.push({
      name: option.label,
      unit: metadataString(meta(option), "unit")
        ?? metadataString(meta(option), "defaultUnit")
        ?? "mg",
    })
  }
  return [...byGroup.values()]
}

export type ClinicalEventCategory = {
  cat: string
  color: string
  isComplication?: boolean
  events: {
    code: string
    label: string
    labelBg: string | null
    color: string
  }[]
}

export function groupClinicalEvents(options: LibraryOption[]): ClinicalEventCategory[] {
  const byGroup = new Map<string, ClinicalEventCategory>()
  for (const option of options) {
    const category = option.group ?? "Other"
    if (!byGroup.has(category)) {
      byGroup.set(category, {
        cat: category,
        color: metadataString(meta(option), "categoryColor") ?? "#64748b",
        isComplication: metadataBoolean(meta(option), "isComplication") ?? false,
        events: [],
      })
    }
    byGroup.get(category)!.events.push({
      code: option.value,
      label: option.label,
      labelBg: option.labelBg,
      color: option.color ?? "#64748b",
    })
  }
  return [...byGroup.values()]
}

export function canStartDrugAsInfusion(
  drug: { name?: string } | null | undefined,
  infusionDrugs: { name: string }[],
): boolean {
  return !!drug?.name && infusionDrugs.some(entry => entry.name === drug.name)
}

export type PositionOption = { code: string; label: string; desc: string; color: string }
export type MonitoringOption = { label: string; field: string; section: string }
export type AirwayOption = { code: string; label: string }
export type PremedicationDrug = {
  name: string
  dose: number
  unit: string
  min: number
  max: number
  step: number
  routes: string[]
  defaultRoute: string
  hint: string
}
export type PremedicationCategory = { category: string; drugs: PremedicationDrug[] }

export function mapPositionOptions(
  options: LibraryOption[],
  colorByCode: Record<string, string> = {},
): PositionOption[] {
  return options.map(option => ({
    code: option.value,
    label: option.label,
    desc: option.description ?? "",
    color: colorByCode[option.value] ?? "#64748b",
  }))
}

export function mapMonitoringOptions(options: LibraryOption[]): MonitoringOption[] {
  return options.map(option => ({
    label: option.label,
    field: option.value,
    section: option.group ?? "other",
  }))
}

export function mapAirwayOptions(options: LibraryOption[], group: "Instrument" | "Device"): AirwayOption[] {
  return options
    .filter(option => option.group === group)
    .map(option => ({ code: option.value, label: option.label }))
}

export function mapPremedicationCategories(options: LibraryOption[]): PremedicationCategory[] {
  const byGroup = new Map<string, PremedicationCategory>()
  for (const option of options) {
    const category = option.group ?? "Other"
    if (!byGroup.has(category)) byGroup.set(category, { category, drugs: [] })
    const metadata = option.metadata ?? {}
    const routes = metadataStrings(metadata, "routes")
    byGroup.get(category)!.drugs.push({
      name: option.label,
      dose: metadataNumber(metadata, "dose") ?? 1,
      unit: metadataString(metadata, "unit") ?? "mg",
      min: metadataNumber(metadata, "min") ?? 0,
      max: metadataNumber(metadata, "max") ?? 100,
      step: metadataNumber(metadata, "step") ?? 1,
      routes: routes.length ? routes : ["PO"],
      defaultRoute: metadataString(metadata, "defaultRoute") ?? "PO",
      hint: metadataString(metadata, "hint") ?? "",
    })
  }
  return [...byGroup.values()]
}

export function premedicationDoseMap(options: LibraryOption[]): Record<string, Omit<PremedicationDrug, "name">> {
  const map: Record<string, Omit<PremedicationDrug, "name">> = {}
  for (const category of mapPremedicationCategories(options)) {
    for (const { name, ...dose } of category.drugs) map[name] = dose
  }
  return map
}
