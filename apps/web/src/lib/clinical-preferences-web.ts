"use client"

import {
  applyClinicalPreferencesPatch,
  combineClinicalPreferencesPatches,
  mergeClinicalPreferences,
  normalizeClinicalPreferences,
  type ClinicalPreferences,
  type ClinicalPreferencesPatch,
} from "@lospor/core/clinical-preferences"

const SNAPSHOT_KEY = "losporClinicalPreferencesV1"
const DIRTY_KEY = "losporClinicalPreferencesDirtyV1"

function readPendingPatch(): ClinicalPreferencesPatch | null {
  const raw = localStorage.getItem(DIRTY_KEY)
  if (!raw || raw === "true") return null
  try {
    return combineClinicalPreferencesPatches(JSON.parse(raw))
  } catch {
    return null
  }
}

function writePendingPatch(patch: ClinicalPreferencesPatch): void {
  const pending = combineClinicalPreferencesPatches(
    readPendingPatch(),
    patch,
  )
  localStorage.setItem(DIRTY_KEY, JSON.stringify(pending))
}

function enabled(key: string): boolean {
  return localStorage.getItem(key) === "on"
}

function readSnapshot(): ClinicalPreferences | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    return raw ? normalizeClinicalPreferences(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function readWebClinicalPreferences(): ClinicalPreferences {
  if (typeof window === "undefined") return normalizeClinicalPreferences({})
  return readSnapshot() ?? normalizeClinicalPreferences({
    heightUnit: localStorage.getItem("heightUnit"),
    weightUnit: localStorage.getItem("weightUnit"),
    temperatureUnit: localStorage.getItem("temperatureUnit"),
    etco2Unit: localStorage.getItem("etco2Unit"),
    defaultMonitoring: localStorage.getItem("defaultMonitoring"),
    autoFillVitals: enabled("autoFillVitals"),
    autoFillBP: enabled("autoFillBP"),
    autoFillBackground: enabled("autoFillBackground"),
  })
}

export function writeWebClinicalPreferences(
  preferences: ClinicalPreferences,
): void {
  if (typeof window === "undefined") return
  const normalized = normalizeClinicalPreferences(preferences)
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(normalized))
  const values: Record<string, string> = {
    heightUnit: normalized.units.height,
    weightUnit: normalized.units.weight,
    temperatureUnit: normalized.units.temperature,
    etco2Unit: normalized.units.etco2,
    defaultMonitoring: normalized.defaultMonitoring,
    autoFillVitals: normalized.autoFillVitals.enabled ? "on" : "off",
    autoFillBP:
      normalized.autoFillVitals.includeBloodPressure ? "on" : "off",
    autoFillBackground:
      normalized.autoFillVitals.backfillOnReopen ? "on" : "off",
  }
  for (const [key, value] of Object.entries(values)) {
    localStorage.setItem(key, value)
    window.dispatchEvent(new StorageEvent("storage", {
      key,
      newValue: value,
    }))
  }
}

async function pushPreferences(
  preferences: ClinicalPreferences | ClinicalPreferencesPatch,
): Promise<boolean> {
  try {
    const response = await fetch("/api/user", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences }),
    })
    if (!response.ok) return false
    localStorage.removeItem(DIRTY_KEY)
    return true
  } catch {
    return false
  }
}

export async function syncWebClinicalPreferences(): Promise<ClinicalPreferences> {
  const local = readWebClinicalPreferences()
  const dirtyRaw = localStorage.getItem(DIRTY_KEY)
  const pending = readPendingPatch()
  try {
    const response = await fetch("/api/user", { cache: "no-store" })
    if (!response.ok) return local
    const data = await response.json() as { preferences?: unknown }
    const merged = dirtyRaw === "true"
      ? applyClinicalPreferencesPatch(
          mergeClinicalPreferences(data.preferences, local),
          local,
        )
      : pending
        ? applyClinicalPreferencesPatch(
            mergeClinicalPreferences(data.preferences, local),
            pending,
          )
      : mergeClinicalPreferences(data.preferences, local)
    writeWebClinicalPreferences(merged)
    if (!await pushPreferences(pending ?? merged)) {
      if (!dirtyRaw) writePendingPatch(merged)
    }
    return merged
  } catch {
    return local
  }
}

export async function patchWebClinicalPreferences(
  patch: ClinicalPreferencesPatch,
): Promise<ClinicalPreferences> {
  const next = applyClinicalPreferencesPatch(
    readWebClinicalPreferences(),
    patch,
  )
  writeWebClinicalPreferences(next)
  writePendingPatch(patch)
  if (await pushPreferences(patch)) {
    localStorage.removeItem(DIRTY_KEY)
  }
  return next
}
