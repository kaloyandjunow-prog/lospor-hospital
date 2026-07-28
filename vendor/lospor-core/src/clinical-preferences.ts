import {
  normalizeAutoFillVitalsPreferences,
  type AutoFillVitalsPreferences,
} from "./intraop-vitals"

export const CLINICAL_PREFERENCES_VERSION = 1
export const MAX_INTRAOP_FAVOURITES = 8

export type ClinicalUnits = {
  height: "cm" | "in"
  weight: "kg" | "lb"
  temperature: "C" | "F"
  etco2: "mmHg" | "kPa"
}

export type DefaultMonitoring = "standard" | "advanced"

export type ClinicalPreferences = {
  clinicalPreferencesVersion: typeof CLINICAL_PREFERENCES_VERSION
  units: ClinicalUnits
  defaultMonitoring: DefaultMonitoring
  autoFillVitals: AutoFillVitalsPreferences
  intraopFavouriteDrugs: string[]
  intraopFavouriteInfusions: string[]
}

export type ClinicalPreferencesPatch = {
  clinicalPreferencesVersion?: number
  units?: Partial<ClinicalUnits>
  defaultMonitoring?: DefaultMonitoring
  autoFillVitals?: Partial<AutoFillVitalsPreferences>
  intraopFavouriteDrugs?: string[]
  intraopFavouriteInfusions?: string[]
}

export const DEFAULT_CLINICAL_PREFERENCES: ClinicalPreferences = {
  clinicalPreferencesVersion: CLINICAL_PREFERENCES_VERSION,
  units: {
    height: "cm",
    weight: "kg",
    temperature: "C",
    etco2: "mmHg",
  },
  defaultMonitoring: "standard",
  autoFillVitals: normalizeAutoFillVitalsPreferences({}),
  intraopFavouriteDrugs: [],
  intraopFavouriteInfusions: [],
}

function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function favourites(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map(item => item.trim())
      .filter(Boolean),
  )].slice(0, MAX_INTRAOP_FAVOURITES)
}

export function parseClinicalPreferencesPatch(value: unknown): ClinicalPreferencesPatch {
  const input = record(value)
  const unitsInput = record(input.units)
  const autoFillInput = record(input.autoFillVitals)
  const patch: ClinicalPreferencesPatch = {}
  const units: Partial<ClinicalUnits> = {}

  const height = unitsInput.height ?? input.heightUnit
  if (height === "cm" || height === "in") units.height = height
  const weight = unitsInput.weight ?? input.weightUnit
  if (weight === "kg" || weight === "lb") units.weight = weight
  const temperature = unitsInput.temperature ?? input.temperatureUnit
  if (temperature === "C" || temperature === "F") units.temperature = temperature
  const etco2 = unitsInput.etco2 ?? input.etco2Unit
  if (etco2 === "mmHg" || etco2 === "kPa") units.etco2 = etco2
  if (Object.keys(units).length) patch.units = units

  const monitoring = input.defaultMonitoring
  if (monitoring === "standard" || monitoring === "advanced") {
    patch.defaultMonitoring = monitoring
  }

  const enabled = autoFillInput.enabled ?? input.autoFillVitals
  const includeBloodPressure = autoFillInput.includeBloodPressure ?? input.autoFillBP
  const backfillOnReopen = autoFillInput.backfillOnReopen ?? input.autoFillBackground ?? input.autoFillBg
  if (
    typeof enabled === "boolean"
    || typeof includeBloodPressure === "boolean"
    || typeof backfillOnReopen === "boolean"
  ) {
    patch.autoFillVitals = {
      ...(typeof enabled === "boolean" ? { enabled } : {}),
      ...(typeof includeBloodPressure === "boolean" ? { includeBloodPressure } : {}),
      ...(typeof backfillOnReopen === "boolean" ? { backfillOnReopen } : {}),
    }
  }

  const drugs = favourites(input.intraopFavouriteDrugs)
  if (drugs) patch.intraopFavouriteDrugs = drugs
  const infusions = favourites(input.intraopFavouriteInfusions)
  if (infusions) patch.intraopFavouriteInfusions = infusions
  return patch
}

export function normalizeClinicalPreferences(value: unknown): ClinicalPreferences {
  const patch = parseClinicalPreferencesPatch(value)
  return {
    clinicalPreferencesVersion: CLINICAL_PREFERENCES_VERSION,
    units: { ...DEFAULT_CLINICAL_PREFERENCES.units, ...patch.units },
    defaultMonitoring: patch.defaultMonitoring ?? DEFAULT_CLINICAL_PREFERENCES.defaultMonitoring,
    autoFillVitals: normalizeAutoFillVitalsPreferences({
      ...DEFAULT_CLINICAL_PREFERENCES.autoFillVitals,
      ...patch.autoFillVitals,
    }),
    intraopFavouriteDrugs: patch.intraopFavouriteDrugs ?? [],
    intraopFavouriteInfusions: patch.intraopFavouriteInfusions ?? [],
  }
}

// Server values win. Device values only fill fields that have never been
// stored on the account, allowing a one-time import of existing local choices.
export function mergeClinicalPreferences(
  serverValue: unknown,
  deviceValue: unknown,
): ClinicalPreferences {
  const server = parseClinicalPreferencesPatch(serverValue)
  const device = parseClinicalPreferencesPatch(deviceValue)
  return normalizeClinicalPreferences({
    units: { ...device.units, ...server.units },
    defaultMonitoring: server.defaultMonitoring ?? device.defaultMonitoring,
    autoFillVitals: { ...device.autoFillVitals, ...server.autoFillVitals },
    intraopFavouriteDrugs:
      server.intraopFavouriteDrugs ?? device.intraopFavouriteDrugs,
    intraopFavouriteInfusions:
      server.intraopFavouriteInfusions ?? device.intraopFavouriteInfusions,
  })
}

export function applyClinicalPreferencesPatch(
  currentValue: unknown,
  patchValue: unknown,
): ClinicalPreferences {
  const current = normalizeClinicalPreferences(currentValue)
  const patch = parseClinicalPreferencesPatch(patchValue)
  return normalizeClinicalPreferences({
    ...current,
    ...patch,
    units: { ...current.units, ...patch.units },
    autoFillVitals: { ...current.autoFillVitals, ...patch.autoFillVitals },
  })
}

export function combineClinicalPreferencesPatches(
  ...values: unknown[]
): ClinicalPreferencesPatch {
  const combined: ClinicalPreferencesPatch = {}
  for (const value of values) {
    const patch = parseClinicalPreferencesPatch(value)
    if (patch.units) {
      combined.units = { ...combined.units, ...patch.units }
    }
    if (patch.defaultMonitoring) {
      combined.defaultMonitoring = patch.defaultMonitoring
    }
    if (patch.autoFillVitals) {
      combined.autoFillVitals = {
        ...combined.autoFillVitals,
        ...patch.autoFillVitals,
      }
    }
    if (patch.intraopFavouriteDrugs !== undefined) {
      combined.intraopFavouriteDrugs = patch.intraopFavouriteDrugs
    }
    if (patch.intraopFavouriteInfusions !== undefined) {
      combined.intraopFavouriteInfusions = patch.intraopFavouriteInfusions
    }
  }
  return combined
}
