/** Canonical fluid-entry modes shared by the web, mobile and API projection. */
export const FLUID_ENTRY_MODES = ["VOLUME", "RATE"] as const
export type FluidEntryMode = typeof FLUID_ENTRY_MODES[number]

export const FLUID_RATE_CALCULATIONS = ["HOLLIDAY_SEGAR_4_2_1"] as const
export type FluidRateCalculation = typeof FLUID_RATE_CALCULATIONS[number]

export type FluidRateSliderProfile = {
  min: number
  max: number
  step: number
  allowManualOutsideRange: boolean
  calculation?: FluidRateCalculation
}

export const FLUID_RATE_SLIDER = Object.freeze({
  min: 1,
  max: 200,
  step: 1,
  allowManualOutsideRange: true,
} satisfies FluidRateSliderProfile)

export type FluidEntryModeProfile = {
  fluidEntryModes?: FluidEntryMode[]
  defaultFluidEntryMode?: FluidEntryMode
  fluidRate?: FluidRateSliderProfile
}

export function normalizeFluidEntryMode(value: unknown): FluidEntryMode {
  return value === "RATE" ? "RATE" : "VOLUME"
}

function finiteNonNegative(value: unknown): number | null {
  if (value == null || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function canonicalMl(value: unknown): number | null {
  const parsed = finiteNonNegative(value)
  if (parsed == null) return null
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(parsed))
}

function instantMs(value: Date | string | number): number | null {
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

export type FluidRateChangeInput = {
  ts: Date | string | number
  rate: number | string
  unit?: string
}

export type RateFluidVolumeInput = {
  startTs: Date | string | number
  endTs: Date | string | number
  rate: number | string
  rateChanges?: readonly FluidRateChangeInput[]
  administeredVolumeMl?: number | null
}

/**
 * Integrates mL/h against real event instants. Five-minute chart columns are
 * deliberately not used: they are a display projection and would lose partial
 * intervals. The returned volume is a canonical integer number of millilitres.
 */
export function calculateRateFluidVolumeMl(input: RateFluidVolumeInput): number {
  const override = canonicalMl(input.administeredVolumeMl)
  if (override != null) return override

  const start = instantMs(input.startTs)
  const end = instantMs(input.endTs)
  if (start == null || end == null || end <= start) return 0

  let previousTs = start
  let previousRate = finiteNonNegative(input.rate) ?? 0
  let deliveredMl = 0
  const changes = (input.rateChanges ?? [])
    .map((change, index) => ({
      index,
      ts: instantMs(change.ts),
      rate: finiteNonNegative(change.rate),
    }))
    .filter((change): change is { index: number; ts: number; rate: number } =>
      change.ts != null && change.rate != null && change.ts <= end,
    )
    .sort((left, right) => left.ts - right.ts || left.index - right.index)

  for (const change of changes) {
    if (change.ts <= start) {
      previousRate = change.rate
      continue
    }
    deliveredMl += previousRate * (change.ts - previousTs) / 3_600_000
    previousTs = change.ts
    previousRate = change.rate
  }
  deliveredMl += previousRate * (end - previousTs) / 3_600_000
  return canonicalMl(deliveredMl) ?? 0
}

export type FluidVolumeInput = {
  fluidEntryMode?: FluidEntryMode | null
  bagVolumeMl?: number | string | null
  administeredVolumeMl?: number | string | null
  legacyVolume?: number | string | null
  startTs?: Date | string | number | null
  endTs?: Date | string | number | null
  rate?: number | string | null
  rateChanges?: readonly FluidRateChangeInput[]
}

/** One canonical volume path prevents bag and rate quantities being counted together. */
export function calculateFluidVolumeMl(input: FluidVolumeInput): number {
  const override = canonicalMl(input.administeredVolumeMl)
  if (override != null) return override
  if (normalizeFluidEntryMode(input.fluidEntryMode) === "RATE") {
    if (input.startTs == null || input.endTs == null || input.rate == null) return 0
    return calculateRateFluidVolumeMl({
      startTs: input.startTs,
      endTs: input.endTs,
      rate: input.rate,
      rateChanges: input.rateChanges,
    })
  }
  return canonicalMl(input.bagVolumeMl) ?? canonicalMl(input.legacyVolume) ?? 0
}

/** 4/2/1 hourly maintenance rate with the product-approved display rounding. */
export function calculatePediatricMaintenanceRateMlPerHour(weightKg: number): number | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null
  const raw = weightKg <= 10
    ? weightKg * 4
    : weightKg <= 20
      ? 40 + (weightKg - 10) * 2
      : 60 + (weightKg - 20)
  return raw < 10 ? Math.round(raw) : Math.round(raw / 10) * 10
}

/** Explicit weight choice; resolving McLaren IBW does not itself diagnose obesity. */
export function resolvePediatricMaintenanceWeightKg(input: {
  totalBodyWeightKg?: number | null
  mclarenIdealBodyWeightKg?: number | null
  useIdealBodyWeight?: boolean
}): number | null {
  const total = finiteNonNegative(input.totalBodyWeightKg)
  const ideal = finiteNonNegative(input.mclarenIdealBodyWeightKg)
  if (input.useIdealBodyWeight && ideal != null && ideal > 0) return ideal
  return total != null && total > 0 ? total : null
}

export type FluidProductIdentity = {
  name?: string | null
  category?: string | null
  concentration?: string | null
}

function normalized(value: string | null | undefined): string {
  return value?.trim().toUpperCase().replace(/\s+/g, " ") ?? ""
}

function percentStrength(value: string): number | null {
  const match = value.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*%(?:\s|$)/)
  if (!match) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

function salinePercentStrength(name: string, concentration: string): number | null {
  const selected = percentStrength(concentration)
  if (selected != null) return selected
  const afterSaline = name.match(/\bSALINE\b[^0-9]*(\d+(?:\.\d+)?)\s*%/)
  const beforeSaline = name.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*%\s+SALINE\b/)
  const parsed = Number(afterSaline?.[1] ?? beforeSaline?.[1])
  return Number.isFinite(parsed) ? parsed : null
}

export function isBloodProductFluid(input: FluidProductIdentity): boolean {
  const category = normalized(input.category)
  const name = normalized(input.name)
  return category === "BLOOD PRODUCTS"
    || /\b(PRBC|PACKED RED|FRESH FROZEN PLASMA|FFP|PLATELETS?|CRYOPRECIPITATE|WHOLE BLOOD|CELL SALVAGE|AUTOLOGOUS BLOOD)\b/.test(name)
}

/** Products for which 4/2/1 is a maintenance-rate suggestion, not a special dose. */
export function isMaintenanceCompatibleFluid(input: FluidProductIdentity): boolean {
  if (isBloodProductFluid(input)) return false
  if (normalized(input.category) !== "CRYSTALLOIDS") return false
  const name = normalized(input.name)
  const concentration = normalized(input.concentration)
  if (/\b(HES|HYDROXYETHYL STARCH|GELATIN|ALBUMIN|MANNITOL|LIPID|FAT EMULSION)\b/.test(name)) {
    return false
  }
  if (/\b(D10W|DEXTROSE 10%)\b/.test(name)) return false
  if (/\bSALINE\b/.test(name)) {
    const strength = salinePercentStrength(name, concentration)
    // Only the catalogued maintenance saline strengths receive 4/2/1.
    // Unknown/custom strengths stay manual rather than treating a hypertonic
    // formulation such as 3.0% or 7.5% as maintenance fluid.
    if (strength != null && ![0.225, 0.45, 0.9].some(value => Math.abs(value - strength) < 1e-9)) {
      return false
    }
  }
  return true
}

export type ResolvedFluidEntryModeProfile = {
  fluidEntryModes: FluidEntryMode[]
  defaultFluidEntryMode: FluidEntryMode
  fluidRate: FluidRateSliderProfile
}

/**
 * Missing profile metadata preserves adult volume behavior. Pediatric
 * non-blood products default to rate entry; special-dose products simply do
 * not receive the 4/2/1 calculation marker.
 */
export function resolveFluidEntryModeProfile(input: FluidProductIdentity & {
  clinicalMode: "ADULT" | "PEDIATRIC"
  profile?: FluidEntryModeProfile | null
}): ResolvedFluidEntryModeProfile {
  if (isBloodProductFluid(input)) {
    return {
      fluidEntryModes: ["VOLUME"],
      defaultFluidEntryMode: "VOLUME",
      fluidRate: { ...FLUID_RATE_SLIDER },
    }
  }
  const authoredModes = input.profile?.fluidEntryModes?.filter(
    (mode, index, values) => FLUID_ENTRY_MODES.includes(mode) && values.indexOf(mode) === index,
  ) ?? []
  const fluidEntryModes = authoredModes.length ? authoredModes : [...FLUID_ENTRY_MODES]
  const authoredDefault = input.profile?.defaultFluidEntryMode
  const fallbackDefault: FluidEntryMode = input.clinicalMode === "PEDIATRIC" ? "RATE" : "VOLUME"
  const defaultFluidEntryMode = authoredDefault && fluidEntryModes.includes(authoredDefault)
    ? authoredDefault
    : fluidEntryModes.includes(fallbackDefault)
      ? fallbackDefault
      : fluidEntryModes[0] ?? "VOLUME"
  const authoredRate = input.profile?.fluidRate
  const maintenanceCompatible = isMaintenanceCompatibleFluid(input)
  return {
    fluidEntryModes,
    defaultFluidEntryMode,
    fluidRate: {
      // Rate entry is a shared interaction contract: the slider always spans
      // 1-200 mL/h in single-mL steps, while the numeric entry may exceed it.
      // Authored fluid metadata may select a calculation, but it must not make
      // the web and mobile rate controls behave differently.
      ...FLUID_RATE_SLIDER,
      ...(authoredRate?.calculation && maintenanceCompatible
        ? { calculation: authoredRate.calculation }
        : input.clinicalMode === "PEDIATRIC" && maintenanceCompatible
          ? { calculation: "HOLLIDAY_SEGAR_4_2_1" as const }
          : {}),
    },
  }
}
