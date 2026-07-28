import { usePreferences } from "@/lib/preferences-context"

export function useIntraopAutofillPreferences() {
  const { autoFillVitalsPreferences } = usePreferences()
  return {
    autoFillVitals: autoFillVitalsPreferences.enabled,
    autoFillBP: autoFillVitalsPreferences.includeBloodPressure,
    autoFillBg: autoFillVitalsPreferences.backfillOnReopen,
  }
}
