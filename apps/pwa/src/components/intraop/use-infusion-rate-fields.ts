import { useEffect, useState } from "react"
import type { DoseLimit } from "@lospor/core/catalog"
import {
  switchInfusionEntry,
  infusionEntrySurface,
  infusionEntryUnits,
  infusionReadout,
  infusionRecord,
  type InfusionRecord,
} from "@lospor/core/infusion-entry"
import { PUMP_RATE_UNIT } from "@lospor/core/infusion-volume"
import type { DoseSelectorProps } from "@/components/intraop/DoseSelector"
import { usePreferences } from "@/lib/preferences-context"

type SelectorPart = Pick<DoseSelectorProps,
  "value" | "onValueChange" | "min" | "max" | "step" | "quickValues" | "unitSuffix" | "units" | "unit" | "onUnitChange">

/**
 * An infusion's rate entry (2026-10-18). The rate may be entered in the drug's
 * unit, the other dose unit of the same amount (per kg or not), or as the
 * pump rate in mL/hr; switching carries the value across. The strength picked
 * (a syringe, or a % for a local anaesthetic) gives the other rate, read out
 * beside the box, and both are recorded. The logic is core's
 * (infusion-entry.ts), shared with the web.
 */
export function useInfusionRateFields(input: {
  /** Changes when the drug or route does: the unit choice starts again. */
  resetKey: string
  /** The drug, for the units it is charted in. */
  name?: string
  /** The rule's unit, which the range and pills belong to. */
  unit: string
  /** The unit the box starts in, when not the rule's (a running infusion's). */
  initialEntryUnit?: string
  min: number
  max: number
  step: number
  quickValues?: number[]
  doseLimit?: DoseLimit
  concentration?: string
  weightKg?: number | null
  rate: string
  setRate: (value: string) => void
}): {
  selector: SelectorPart
  readout?: string
  /** What the start or change records: both rates. */
  record: () => InfusionRecord | null
  /** The rate to suggest after the strength changes, in the box's unit, when the rule has one. */
  suggestedFor: (concentration: string | undefined) => string | undefined
} {
  const { tc } = usePreferences()
  const { unit, rate, setRate } = input
  const startUnit = input.initialEntryUnit ?? unit
  const [entryUnit, setEntryUnit] = useState(startUnit)
  const [doseUnit, setDoseUnit] = useState(startUnit === PUMP_RATE_UNIT ? unit : startUnit)
  useEffect(() => {
    setEntryUnit(startUnit)
    setDoseUnit(startUnit === PUMP_RATE_UNIT ? unit : startUnit)
  }, [input.resetKey, startUnit, unit])

  const base = {
    name: input.name, unit, min: input.min, max: input.max, step: input.step, quickValues: input.quickValues,
    doseLimit: input.doseLimit, concentration: input.concentration, weightKg: input.weightKg,
  }
  const offered = infusionEntryUnits(base)
  const units = offered.includes(entryUnit) ? offered : [entryUnit, ...offered]
  const surface = infusionEntrySurface({ ...base, entryUnit })
  const value = Number(rate)
  const readout = rate ? infusionReadout({ ...base, value, entryUnit, doseUnit }) : {}
  const readoutText = [
    readout.pumpMlPerHour != null ? `${readout.pumpMlPerHour} ${PUMP_RATE_UNIT} ${tc("volumeOnPump")}` : null,
    readout.volumeRate ? `${readout.volumeRate.value} ${readout.volumeRate.unit}` : null,
    readout.doseRate ? `${readout.doseRate.value} ${readout.doseRate.unit}` : null,
  ].filter(Boolean).join(" · ")

  const switchUnit = (next: string) => {
    if (next === entryUnit) return
    const converted = rate ? switchInfusionEntry({ ...base, value, from: entryUnit, to: next }) : null
    setRate(converted == null ? "" : String(converted))
    setEntryUnit(next)
    if (next !== PUMP_RATE_UNIT) setDoseUnit(next)
  }

  return {
    selector: {
      value: rate,
      onValueChange: setRate,
      min: surface.min,
      max: surface.max,
      step: surface.step,
      quickValues: surface.quickValues,
      unitSuffix: entryUnit,
      ...(units.length > 1 ? { units, unit: entryUnit, onUnitChange: switchUnit } : {}),
    },
    readout: readoutText || undefined,
    record: () => rate ? infusionRecord({ ...base, value, entryUnit, doseUnit }) : null,
    suggestedFor: next => {
      if (!input.doseLimit || entryUnit !== unit) return undefined
      const suggested = infusionEntrySurface({ ...base, concentration: next, entryUnit: unit }).suggestedRate
      return suggested == null ? undefined : String(suggested)
    },
  }
}
