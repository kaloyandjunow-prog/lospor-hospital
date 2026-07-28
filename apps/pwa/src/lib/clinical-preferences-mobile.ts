import * as SecureStore from "expo-secure-store"
import { apiFetch, apiJson } from "@/lib/api"
import {
  applyClinicalPreferencesPatch,
  combineClinicalPreferencesPatches,
  mergeClinicalPreferences,
  normalizeClinicalPreferences,
  type ClinicalPreferences,
  type ClinicalPreferencesPatch,
} from "@lospor/core/clinical-preferences"

const SNAPSHOT_KEY = "lospor_clinical_preferences_v1"
const DIRTY_KEY = "lospor_clinical_preferences_dirty_v1"

const LEGACY_KEYS = {
  height: "lospor_height_unit",
  weight: "lospor_weight_unit",
  temperature: "lospor_temperature_unit",
  etco2: "lospor_etco2_unit",
  autoFillVitals: "intraop_autofill_vitals",
  autoFillBP: "intraop_autofill_bp",
  autoFillBg: "intraop_autofill_bg",
} as const

type UserPreferencesResponse = {
  preferences?: unknown
}

function parsePendingPatch(
  value: string | null,
): ClinicalPreferencesPatch | null {
  if (!value || value === "true") return null
  try {
    return combineClinicalPreferencesPatches(JSON.parse(value))
  } catch {
    return null
  }
}

async function writePendingPatch(
  patch: ClinicalPreferencesPatch,
): Promise<void> {
  const current = parsePendingPatch(
    await SecureStore.getItemAsync(DIRTY_KEY).catch(() => null),
  )
  const pending = combineClinicalPreferencesPatches(current, patch)
  await SecureStore.setItemAsync(DIRTY_KEY, JSON.stringify(pending))
}

function parseSnapshot(value: string | null): ClinicalPreferences | null {
  if (!value) return null
  try {
    return normalizeClinicalPreferences(JSON.parse(value))
  } catch {
    return null
  }
}

async function readLegacyPreferences(): Promise<ClinicalPreferences> {
  const [
    height,
    weight,
    temperature,
    etco2,
    autoFillVitals,
    autoFillBP,
    autoFillBg,
  ] = await Promise.all([
    SecureStore.getItemAsync(LEGACY_KEYS.height),
    SecureStore.getItemAsync(LEGACY_KEYS.weight),
    SecureStore.getItemAsync(LEGACY_KEYS.temperature),
    SecureStore.getItemAsync(LEGACY_KEYS.etco2),
    SecureStore.getItemAsync(LEGACY_KEYS.autoFillVitals),
    SecureStore.getItemAsync(LEGACY_KEYS.autoFillBP),
    SecureStore.getItemAsync(LEGACY_KEYS.autoFillBg),
  ])
  return normalizeClinicalPreferences({
    heightUnit: height,
    weightUnit: weight,
    temperatureUnit: temperature,
    etco2Unit: etco2,
    autoFillVitals: autoFillVitals === "on",
    autoFillBP: autoFillBP === "on",
    autoFillBg: autoFillBg === "on",
  })
}

export async function readMobileClinicalPreferences(): Promise<ClinicalPreferences> {
  const snapshot = parseSnapshot(
    await SecureStore.getItemAsync(SNAPSHOT_KEY).catch(() => null),
  )
  return snapshot ?? readLegacyPreferences()
}

export async function writeMobileClinicalPreferences(
  preferences: ClinicalPreferences,
): Promise<void> {
  const normalized = normalizeClinicalPreferences(preferences)
  await Promise.all([
    SecureStore.setItemAsync(SNAPSHOT_KEY, JSON.stringify(normalized)),
    SecureStore.setItemAsync(LEGACY_KEYS.height, normalized.units.height),
    SecureStore.setItemAsync(LEGACY_KEYS.weight, normalized.units.weight),
    SecureStore.setItemAsync(
      LEGACY_KEYS.temperature,
      normalized.units.temperature,
    ),
    SecureStore.setItemAsync(LEGACY_KEYS.etco2, normalized.units.etco2),
    SecureStore.setItemAsync(
      LEGACY_KEYS.autoFillVitals,
      normalized.autoFillVitals.enabled ? "on" : "off",
    ),
    SecureStore.setItemAsync(
      LEGACY_KEYS.autoFillBP,
      normalized.autoFillVitals.includeBloodPressure ? "on" : "off",
    ),
    SecureStore.setItemAsync(
      LEGACY_KEYS.autoFillBg,
      normalized.autoFillVitals.backfillOnReopen ? "on" : "off",
    ),
  ])
}

async function pushPreferences(
  preferences: ClinicalPreferences | ClinicalPreferencesPatch,
): Promise<boolean> {
  try {
    const response = await apiFetch("/api/user", {
      method: "PATCH",
      body: JSON.stringify({ preferences }),
    })
    if (!response.ok) return false
    await SecureStore.deleteItemAsync(DIRTY_KEY).catch(() => {})
    return true
  } catch {
    return false
  }
}

export async function syncMobileClinicalPreferences(): Promise<ClinicalPreferences> {
  const local = await readMobileClinicalPreferences()
  const dirtyRaw = await SecureStore.getItemAsync(DIRTY_KEY).catch(() => null)
  const pending = parsePendingPatch(dirtyRaw)
  try {
    const server = await apiJson<UserPreferencesResponse>("/api/user")
    const merged = dirtyRaw === "true"
      ? applyClinicalPreferencesPatch(
          mergeClinicalPreferences(server.preferences, local),
          local,
        )
      : pending
        ? applyClinicalPreferencesPatch(
            mergeClinicalPreferences(server.preferences, local),
            pending,
          )
      : mergeClinicalPreferences(server.preferences, local)
    await writeMobileClinicalPreferences(merged)
    if (!await pushPreferences(pending ?? merged)) {
      if (!dirtyRaw) await writePendingPatch(merged)
    }
    return merged
  } catch {
    return local
  }
}

export async function patchMobileClinicalPreferences(
  current: ClinicalPreferences,
  patch: ClinicalPreferencesPatch,
): Promise<ClinicalPreferences> {
  const next = applyClinicalPreferencesPatch(current, patch)
  await writeMobileClinicalPreferences(next)
  await writePendingPatch(patch)
  if (await pushPreferences(next)) {
    await SecureStore.deleteItemAsync(DIRTY_KEY).catch(() => {})
  }
  return next
}
