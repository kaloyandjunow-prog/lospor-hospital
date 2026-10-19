import type { DoseLimit } from "@lospor/core/catalog"
import {
  switchInfusionEntry,
  infusionEntrySurface,
  infusionEntryUnits,
  infusionReadout,
} from "@lospor/core/infusion-entry"
import { formatSyringe, parseSyringe, PUMP_RATE_UNIT, syringeOptions } from "@lospor/core/infusion-volume"

/**
 * An infusion's rate entry on the web (2026-10-18), for the start flyout and
 * the rate-change dialog alike: the units it may be entered in (its own, the
 * other dose unit, the pump rate), the slider for the unit chosen, the other
 * rate read out beside it, and the strengths offered. The logic is core's
 * (infusion-entry.ts), so the PWA shows the same numbers.
 */
export type InfusionRateInput = {
  /** The drug, for the units it is charted in (propofol also mcg/kg/min). */
  name?: string
  /** The rule's unit, which the range and pills belong to. */
  ruleUnit: string
  /** The unit the value is entered in. */
  entryUnit: string
  /** The dose unit a pump rate is recorded as; the last dose unit chosen. */
  doseUnit?: string
  value: number | string
  min: number
  max: number
  step: number
  quickValues?: readonly number[]
  doseLimit?: DoseLimit
  concentration?: string
  weightKg?: number | null
}

const base = (input: InfusionRateInput) => ({
  name: input.name, unit: input.ruleUnit, min: input.min, max: input.max, step: input.step, quickValues: input.quickValues,
  doseLimit: input.doseLimit, concentration: input.concentration, weightKg: input.weightKg,
})

export function infusionRateView(input: InfusionRateInput & { onPumpLabel: string }): {
  units: string[]
  min: number
  max: number
  step: number
  quickValues?: number[]
  readout?: string
} {
  const offered = infusionEntryUnits(base(input))
  const units = offered.includes(input.entryUnit) ? offered : [input.entryUnit, ...offered]
  const surface = infusionEntrySurface({ ...base(input), entryUnit: input.entryUnit })
  const value = Number(input.value)
  const readout = value > 0 ? infusionReadout({ ...base(input), value, entryUnit: input.entryUnit, doseUnit: input.doseUnit }) : {}
  const text = [
    readout.pumpMlPerHour != null ? `${readout.pumpMlPerHour} ${PUMP_RATE_UNIT} ${input.onPumpLabel}` : null,
    readout.volumeRate ? `${readout.volumeRate.value} ${readout.volumeRate.unit}` : null,
    readout.doseRate ? `${readout.doseRate.value} ${readout.doseRate.unit}` : null,
  ].filter(Boolean).join(" · ")
  return { units, min: surface.min, max: surface.max, step: surface.step, quickValues: surface.quickValues, readout: text || undefined }
}

/** Another entry unit: the value carried across (cleared when it cannot be), and the dose unit remembered. */
export function switchInfusionUnit(input: InfusionRateInput & { next: string }): { value: number | null; entryUnit: string; doseUnit?: string } {
  const value = Number(input.value)
  const converted = input.value === "" || !Number.isFinite(value)
    ? null
    : switchInfusionEntry({ ...base(input), value, from: input.entryUnit, to: input.next })
  return {
    value: converted,
    entryUnit: input.next,
    doseUnit: input.next === PUMP_RATE_UNIT ? input.doseUnit ?? (input.ruleUnit === PUMP_RATE_UNIT ? undefined : input.ruleUnit) : input.next,
  }
}

/** The rule's suggestion at a new strength, for a dose-limited volume entered in its own unit. */
export function suggestedRateAt(input: InfusionRateInput, concentration: string | undefined): number | undefined {
  if (!input.doseLimit || input.entryUnit !== input.ruleUnit) return undefined
  return infusionEntrySurface({ ...base(input), concentration, entryUnit: input.ruleUnit }).suggestedRate
}

/**
 * The strengths offered: a local anaesthetic's %, else the drug's syringes,
 * with the one running first when it was typed. `syringe` says which, for the
 * heading.
 */
export function infusionStrengths(input: { name: string; route?: string; localAnaesthetic?: readonly string[]; running?: string }): { options: string[]; syringe: boolean } {
  if (input.localAnaesthetic?.length) return { options: [...input.localAnaesthetic], syringe: false }
  const presets = syringeOptions(input.name, input.route).map(formatSyringe)
  const running = parseSyringe(input.running) ? input.running! : null
  return { options: [...new Set([...(running ? [running] : []), ...presets])], syringe: true }
}
