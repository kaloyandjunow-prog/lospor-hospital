const MMHG_PER_KPA = 7.50062

export function celsiusToFahrenheit(c: number): number { return c * 9 / 5 + 32 }
export function fahrenheitToCelsius(f: number): number { return (f - 32) * 5 / 9 }
export function celsiusToKelvin(c: number): number { return c + 273.15 }
export function kelvinToCelsius(k: number): number { return k - 273.15 }

export function mmHgToKPa(mmHg: number): number { return mmHg / MMHG_PER_KPA }
export function kPaToMmHg(kPa: number): number { return kPa * MMHG_PER_KPA }
export function mmHgToTorr(mmHg: number): number { return mmHg }
export function torrToMmHg(torr: number): number { return torr }
export function etco2MmHgToPercent(mmHg: number): number { return (mmHg / 760) * 100 }
export function etco2PercentToMmHg(pct: number): number { return (pct / 100) * 760 }

export function cmToMm(cm: number): number { return cm * 10 }
export function mmToCm(mm: number): number { return mm / 10 }
export function cmToM(cm: number): number { return cm / 100 }
export function mToCm(m: number): number { return m * 100 }
export function cmToKm(cm: number): number { return cm / 100_000 }
export function kmToCm(km: number): number { return km * 100_000 }
export function cmToMicrometers(cm: number): number { return cm * 10_000 }
export function micrometersToCm(um: number): number { return um / 10_000 }
export function cmToInches(cm: number): number { return cm / 2.54 }
export function inchesToCm(inches: number): number { return inches * 2.54 }
export function cmToFeet(cm: number): number { return cm / 30.48 }
export function feetToCm(feet: number): number { return feet * 30.48 }

export function kgToMg(kg: number): number { return kg * 1_000_000 }
export function mgToKg(mg: number): number { return mg / 1_000_000 }
export function mgToMcg(mg: number): number { return mg * 1000 }
export function mcgToMg(mcg: number): number { return mcg / 1000 }
export function mgToG(mg: number): number { return mg / 1000 }
export function gToMg(g: number): number { return g * 1000 }
export function kgToMetricTon(kg: number): number { return kg / 1000 }
export function metricTonToKg(t: number): number { return t * 1000 }
export function kgToLb(kg: number): number { return kg / 0.45359237 }
export function lbToKg(lb: number): number { return lb * 0.45359237 }
export function kgToStone(kg: number): number { return kgToLb(kg) / 14 }
export function stoneToKg(stone: number): number { return lbToKg(stone * 14) }
export function mgToGrains(mg: number): number { return mg / 64.79891 }
export function grainsToMg(grains: number): number { return grains * 64.79891 }
export function gToOz(g: number): number { return g / 28.349523125 }
export function ozToG(oz: number): number { return oz * 28.349523125 }

export function mlToL(ml: number): number { return ml / 1000 }
export function lToMl(l: number): number { return l * 1000 }

export type Measurement = "height" | "weight" | "temperature" | "etco2"
export type UnitPreferences = {
  heightUnit: "cm" | "in"
  weightUnit: "kg" | "lb"
  temperatureUnit: "C" | "F"
  etco2Unit: "mmHg" | "kPa"
}

export type MeasurementDisplaySpec = {
  canonicalUnit: string
  alternateUnit: string
  alternateStep: number
  precision: number
  toAlternate: (value: number) => number
  toCanonical: (value: number) => number
}

export const MEASUREMENT_DISPLAY_SPECS: Readonly<Record<Measurement, MeasurementDisplaySpec>> = {
  height: {
    canonicalUnit: "cm",
    alternateUnit: "in",
    alternateStep: 0.5,
    precision: 1,
    toAlternate: cmToInches,
    toCanonical: inchesToCm,
  },
  weight: {
    canonicalUnit: "kg",
    alternateUnit: "lb",
    alternateStep: 1,
    precision: 1,
    toAlternate: kgToLb,
    toCanonical: lbToKg,
  },
  temperature: {
    canonicalUnit: "\u00b0C",
    alternateUnit: "\u00b0F",
    alternateStep: 0.2,
    precision: 1,
    toAlternate: celsiusToFahrenheit,
    toCanonical: fahrenheitToCelsius,
  },
  etco2: {
    canonicalUnit: "mmHg",
    alternateUnit: "kPa",
    alternateStep: 0.1,
    precision: 1,
    toAlternate: mmHgToKPa,
    toCanonical: kPaToMmHg,
  },
}

export function usesAlternateMeasurementUnit(
  measurement: Measurement,
  preferences: UnitPreferences,
): boolean {
  return (
    (measurement === "height" && preferences.heightUnit === "in")
    || (measurement === "weight" && preferences.weightUnit === "lb")
    || (measurement === "temperature" && preferences.temperatureUnit === "F")
    || (measurement === "etco2" && preferences.etco2Unit === "kPa")
  )
}

export function roundMeasurement(value: number, precision: number): number {
  return Math.round(value * 10 ** precision) / 10 ** precision
}

export function measurementDisplayValues(
  measurement: Measurement,
  preferences: UnitPreferences,
  canonicalValue: number | undefined,
  canonicalMin: number,
  canonicalMax: number,
  canonicalStep: number,
): {
  value: number | undefined
  min: number
  max: number
  step: number
  unit: string
  precision: number
  toCanonical: (value: number | undefined) => number | undefined
} {
  const spec = MEASUREMENT_DISPLAY_SPECS[measurement]
  if (!usesAlternateMeasurementUnit(measurement, preferences)) {
    return {
      value: canonicalValue,
      min: canonicalMin,
      max: canonicalMax,
      step: canonicalStep,
      unit: spec.canonicalUnit,
      precision: 0,
      toCanonical: value => value,
    }
  }
  const round = (value: number) => roundMeasurement(value, spec.precision)
  const min = round(spec.toAlternate(canonicalMin))
  const max = round(spec.toAlternate(canonicalMax))
  return {
    value: canonicalValue == null ? undefined : round(spec.toAlternate(canonicalValue)),
    min: Math.min(min, max),
    max: Math.max(min, max),
    step: spec.alternateStep,
    unit: spec.alternateUnit,
    precision: spec.precision,
    toCanonical: value => value == null ? undefined : round(spec.toCanonical(value)),
  }
}
