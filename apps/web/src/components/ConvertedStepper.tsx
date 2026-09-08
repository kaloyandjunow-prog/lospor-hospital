"use client"

import { NumberStepper } from "@/components/NumberStepper"
import { useUnitPreferences } from "@/hooks/useUnitPreferences"
import {
  measurementDisplayValues,
  type Measurement,
} from "@lospor/core/units"

// Wraps NumberStepper so height/weight/temperature/EtCO2 fields respect the
// user's display-unit preference (Settings → Units) without the value ever
// leaving canonical units in the form/DB. The canonical value goes in,
// the canonical value comes out via onCanonicalChange — this component only
// converts what's shown and typed in between.

export function ConvertedStepper({
  measurement, canonicalValue, onCanonicalChange, canonicalMin, canonicalMax, canonicalStep, showSlider,
}: {
  measurement: Measurement
  canonicalValue: number | null | undefined
  onCanonicalChange: (v: number | null) => void
  canonicalMin: number
  canonicalMax: number
  canonicalStep: number
  showSlider?: boolean
}) {
  const prefs = useUnitPreferences()
  const display = measurementDisplayValues(
    measurement,
    prefs,
    canonicalValue ?? undefined,
    canonicalMin,
    canonicalMax,
    canonicalStep,
  )

  return (
    <NumberStepper value={display.value}
      // A clear stays a clear through the unit conversion: converting null
      // would produce NaN and record a measurement nobody took.
      onChange={value => onCanonicalChange(value == null ? null : display.toCanonical(value) ?? null)}
      min={display.min} max={display.max} step={display.step}
      unit={display.unit} showSlider={showSlider} />
  )
}
