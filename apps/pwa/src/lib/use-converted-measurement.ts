import { usePreferences } from "@/lib/preferences-context"
import {
  measurementDisplayValues,
  type Measurement,
  type UnitPreferences as UnitPrefs,
} from "@lospor/core/units"

// Converts canonical value + range into display-unit value + range based on
// the user's Settings → Units preference, for height/weight/temperature/
// EtCO2 entry. The canonical value (cm/kg/°C/mmHg) is what's stored and what
// the caller continues to read/write — this only changes what's shown/typed.
// Spread the result into whichever input component a call site already uses
// (ClinicalNumberInput, VitalNumber, or a plain TextInput).
//
// convertedMeasurement() is a plain function, not a hook, so it's safe to
// call inside a Controller `render` callback (which isn't a real component
// by React's rules-of-hooks definition) — call usePreferences() once at the
// top of your screen component and pass the result in.

export type { Measurement, UnitPrefs }

export function convertedMeasurement(
  measurement: Measurement,
  prefs: UnitPrefs,
  canonicalValue: number | undefined,
  onCanonicalChange: (v: number | undefined) => void,
  canonicalMin: number,
  canonicalMax: number,
  canonicalStep: number,
) {
  const display = measurementDisplayValues(
    measurement,
    prefs,
    canonicalValue,
    canonicalMin,
    canonicalMax,
    canonicalStep,
  )
  return {
    ...display,
    onChange: (value: number | undefined) =>
      onCanonicalChange(display.toCanonical(value)),
  }
}

// Convenience for top-level use (outside a render callback) — reads prefs itself.
export function useConvertedMeasurement(
  measurement: Measurement,
  canonicalValue: number | undefined,
  onCanonicalChange: (v: number | undefined) => void,
  canonicalMin: number,
  canonicalMax: number,
  canonicalStep: number,
) {
  const prefs = usePreferences()
  return convertedMeasurement(measurement, prefs, canonicalValue, onCanonicalChange, canonicalMin, canonicalMax, canonicalStep)
}
