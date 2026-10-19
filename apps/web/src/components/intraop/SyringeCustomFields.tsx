"use client"

import { useEffect, useMemo, useState } from "react"
import {
  customSyringe,
  customSyringeFields,
  syringeAmountUnits,
  type SyringeStrength,
} from "@lospor/core/infusion-volume"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import { DISPLAY_CLINICAL_DOSE_GUIDANCE } from "@/lib/clinical-guidance-policy"
import { useIntraopUiCopy } from "./ui-copy"

/**
 * A syringe typed with Other (2026-10-18): the amount, in a unit that fits the
 * drug, and the volume in mL, each entered like a dose -- slider, one-tap
 * values from the drug's own syringes, a prefill and a typed number. An entry
 * that cannot be used says why; the strength is only set while it is valid.
 * Same fields and limits as the PWA (core customSyringe).
 */
export function SyringeCustomFields({ name, route, doseUnit, onChange }: {
  name: string
  route?: string
  doseUnit: string
  onChange: (label: string | undefined) => void
}) {
  const copy = useIntraopUiCopy()
  const units = syringeAmountUnits(doseUnit)
  const [amountUnit, setAmountUnit] = useState<SyringeStrength["amountUnit"] | undefined>(units[0])
  const fields = useMemo(() => amountUnit ? customSyringeFields({ name, route, amountUnit }) : null, [name, route, amountUnit])
  const [amount, setAmount] = useState(fields ? String(fields.amount.prefill) : "")
  const [volume, setVolume] = useState(fields ? String(fields.volume.prefill) : "")
  const result = customSyringe({ amount, amountUnit, volumeMl: volume, doseUnit })
  const label = "label" in result ? result.label : undefined
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reports the entry, not the callback
  useEffect(() => { onChange(label) }, [label])

  if (!fields || !amountUnit) return null
  const perMl = "strength" in result ? Number((result.strength.amount / result.strength.volumeMl).toPrecision(4)) : null
  return (
    <div data-testid="syringe-custom-fields" className="space-y-2 pt-1">
      <DoseSelector
        accent="blue"
        quickValues={fields.amount.quickValues}
        value={amount}
        onValueChange={setAmount}
        valuePlaceholder={copy.syringeAmount}
        min={fields.amount.min} max={fields.amount.max} step={fields.amount.step}
        units={units.length > 1 ? units : undefined}
        unit={amountUnit}
        onUnitChange={next => {
          const unit = next as SyringeStrength["amountUnit"]
          setAmountUnit(unit)
          setAmount(String(customSyringeFields({ name, route, amountUnit: unit }).amount.prefill))
        }}
        unitSuffix={amountUnit}
        showGuidance={DISPLAY_CLINICAL_DOSE_GUIDANCE}
      />
      <DoseSelector
        accent="blue"
        quickValues={fields.volume.quickValues}
        value={volume}
        onValueChange={setVolume}
        valuePlaceholder={copy.syringeVolume}
        min={fields.volume.min} max={fields.volume.max} step={fields.volume.step}
        unitSuffix="mL"
        showGuidance={DISPLAY_CLINICAL_DOSE_GUIDANCE}
      />
      {"error" in result ? (
        <p role="alert" className="text-[10px] text-red-500 dark:text-red-400">
          {result.error === "amount" ? copy.syringeErrorAmount : result.error === "volume" ? copy.syringeErrorVolume : copy.syringeErrorUnit}
        </p>
      ) : (
        <p className="text-[10px] text-slate-500 dark:text-slate-400">{label} = {perMl} {amountUnit}/mL</p>
      )}
    </div>
  )
}
