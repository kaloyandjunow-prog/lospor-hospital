import * as SecureStore from "expo-secure-store"

import {
  normalizeAutoFillVitalsPreferences,
  type AutoFillVitalsPreferenceInput,
  type AutoFillVitalsPreferences,
} from "@/lib/intraop-vital-log"

const AUTOFILL_VITALS_KEY = "intraop_autofill_vitals"
const AUTOFILL_BP_KEY = "intraop_autofill_bp"
const AUTOFILL_BG_KEY = "intraop_autofill_bg"

const DEFAULT_AUTOFILL_PREFERENCES = normalizeAutoFillVitalsPreferences({})
const listeners = new Set<(preferences: AutoFillVitalsPreferences) => void>()

let cachedPreferences = DEFAULT_AUTOFILL_PREFERENCES

function boolToStored(value: boolean): string {
  return value ? "on" : "off"
}

function emit(preferences: AutoFillVitalsPreferences) {
  cachedPreferences = preferences
  listeners.forEach(listener => listener(preferences))
}

export async function loadIntraopAutofillPreferences(): Promise<AutoFillVitalsPreferences> {
  const [enabled, includeBloodPressure, backfillOnReopen] = await Promise.all([
    SecureStore.getItemAsync(AUTOFILL_VITALS_KEY),
    SecureStore.getItemAsync(AUTOFILL_BP_KEY),
    SecureStore.getItemAsync(AUTOFILL_BG_KEY),
  ])
  cachedPreferences = normalizeAutoFillVitalsPreferences({
    enabled: enabled === "on",
    includeBloodPressure: includeBloodPressure === "on",
    backfillOnReopen: backfillOnReopen === "on",
  })
  return cachedPreferences
}

export async function saveIntraopAutofillPreferences(
  input: AutoFillVitalsPreferenceInput,
): Promise<AutoFillVitalsPreferences> {
  const preferences = normalizeAutoFillVitalsPreferences(input)
  await Promise.all([
    SecureStore.setItemAsync(AUTOFILL_VITALS_KEY, boolToStored(preferences.enabled)),
    SecureStore.setItemAsync(AUTOFILL_BP_KEY, boolToStored(preferences.includeBloodPressure)),
    SecureStore.setItemAsync(AUTOFILL_BG_KEY, boolToStored(preferences.backfillOnReopen)),
  ])
  emit(preferences)
  return preferences
}

export function getCachedIntraopAutofillPreferences(): AutoFillVitalsPreferences {
  return cachedPreferences
}

export function subscribeIntraopAutofillPreferences(
  listener: (preferences: AutoFillVitalsPreferences) => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
