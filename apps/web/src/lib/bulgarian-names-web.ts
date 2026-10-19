import { normalizeClinicalPreferences } from "@lospor/core/clinical-preferences"
import {
  BULGARIAN_NAME_SWITCH_KEYS,
  setBulgarianNameSwitches,
  type BulgarianNameSwitches,
} from "@lospor/core/display"

/** Where the web keeps the account's clinical preferences on this device. */
export const CLINICAL_PREFERENCES_SNAPSHOT_KEY = "losporClinicalPreferencesV1"

/**
 * Applies the reader's Bulgarian-name switches (Settings → UI) from the copy
 * of their preferences this browser keeps, so every name drawn afterwards
 * follows them. Not a client module on purpose: the display wrapper calls it
 * as it loads, and that wrapper is shared with server components.
 */
export function applyStoredBulgarianNames(): void {
  if (typeof window === "undefined") return
  try {
    const raw = window.localStorage.getItem(CLINICAL_PREFERENCES_SNAPSHOT_KEY)
    setBulgarianNameSwitches(normalizeClinicalPreferences(raw ? JSON.parse(raw) : {}).bulgarianNames)
  } catch {
    // No stored preferences: the international names stay.
  }
}

/** The switches named in a print URL (`names=drugs,fluids`), for a PDF the server renders. */
export function bulgarianNamesFromParam(value: string | null | undefined): BulgarianNameSwitches | null {
  if (value == null) return null
  const named = new Set(value.split(",").map(item => item.trim()))
  const switches = {} as BulgarianNameSwitches
  for (const key of BULGARIAN_NAME_SWITCH_KEYS) switches[key] = named.has(key)
  return switches
}
