import { useEffect, useMemo, useRef, useState } from "react"
import { Text, View } from "react-native"
import {
  customSyringe,
  customSyringeFields,
  formatSyringe,
  parseSyringe,
  syringeAmountUnits,
  syringeOptions,
  type SyringeStrength as Strength,
} from "@lospor/core/infusion-volume"
import { DoseSelector, type DoseSelectorProps } from "@/components/intraop/DoseSelector"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

/**
 * A syringe typed with Other (2026-10-18): the amount, in a unit that fits the
 * drug, and the volume in mL, each entered like a dose -- slider, one-tap
 * values from the drug's own syringes, a prefill, and the number tapped for
 * the keypad. An entry that cannot be used says why, and the strength is only
 * set while it is valid.
 */
export function SyringeCustomFields({ name, route, doseUnit, color, onChange }: {
  name: string
  route?: string
  doseUnit: string
  color?: string
  onChange: (label: string | undefined) => void
}) {
  const { tc } = usePreferences()
  const shade = useShade()
  const units = syringeAmountUnits(doseUnit)
  const [amountUnit, setAmountUnit] = useState<Strength["amountUnit"] | undefined>(units[0])
  const fields = useMemo(() => amountUnit ? customSyringeFields({ name, route, amountUnit }) : null, [name, route, amountUnit])
  const [amount, setAmount] = useState(fields ? String(fields.amount.prefill) : "")
  const [volume, setVolume] = useState(fields ? String(fields.volume.prefill) : "")
  const result = customSyringe({ amount, amountUnit, volumeMl: volume, doseUnit })
  const label = "label" in result ? result.label : undefined
  // Reports the entry, not the callback: the latest onChange is kept in a ref.
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })
  useEffect(() => { onChangeRef.current(label) }, [label])

  if (!fields || !amountUnit) return null
  const perMl = "strength" in result ? Number((result.strength.amount / result.strength.volumeMl).toPrecision(4)) : null
  return (
    <View testID="syringe-custom-fields" style={{ marginTop: 10, gap: 6 }}>
      <DoseSelector
        color={color}
        quickValues={fields.amount.quickValues}
        value={amount}
        onValueChange={setAmount}
        min={fields.amount.min} max={fields.amount.max} step={fields.amount.step}
        unitSuffix={amountUnit}
        units={units.length > 1 ? units : undefined}
        unit={amountUnit}
        onUnitChange={next => {
          const unit = next as Strength["amountUnit"]
          setAmountUnit(unit)
          setAmount(String(customSyringeFields({ name, route, amountUnit: unit }).amount.prefill))
        }}
        valuePlaceholder={tc("syringeAmount")}
      />
      <DoseSelector
        color={color}
        quickValues={fields.volume.quickValues}
        value={volume}
        onValueChange={setVolume}
        min={fields.volume.min} max={fields.volume.max} step={fields.volume.step}
        unitSuffix="mL"
        valuePlaceholder={tc("syringeVolume")}
      />
      {"error" in result ? (
        <Text testID="syringe-custom-error" accessibilityRole="alert" style={{ color: shade("#f87171"), fontSize: 12 }}>
          {tc(result.error === "amount" ? "syringeErrorAmount" : result.error === "volume" ? "syringeErrorVolume" : "syringeErrorUnit")}
        </Text>
      ) : (
        <Text style={{ color: shade("#94a3b8"), fontSize: 12 }}>{label} = {perMl} {amountUnit}/mL</Text>
      )}
    </View>
  )
}

/**
 * The strength part of an infusion's dose selector: a local anaesthetic's %,
 * else the drug's syringes with Other as the fields above. `customInvalid`
 * holds the start or change back while Other is open and not yet usable.
 */
export function syringeStrengthProps(input: {
  name?: string
  route?: string
  doseUnit: string
  localAnaesthetic?: string[]
  localAnaestheticUnit?: string
  offerSyringes: boolean
  concentration?: string
  customConcentration?: string
  setConcentration?: (value: string | undefined) => void
  color?: string
  syringeLabel: string
}): { selector: Pick<DoseSelectorProps, "concentrationOptions" | "concentrationLabel" | "concentrationUnit" | "concentrationName" | "customConcentrationContent">; customInvalid: boolean } {
  if (input.localAnaesthetic?.length) {
    return { selector: { concentrationOptions: input.localAnaesthetic, concentrationUnit: input.localAnaestheticUnit, concentrationName: input.name }, customInvalid: false }
  }
  if (!input.name || !input.offerSyringes) return { selector: {}, customInvalid: false }
  const typed = input.customConcentration !== undefined
  const running = parseSyringe(input.concentration) && !typed ? [input.concentration!] : []
  return {
    selector: {
      concentrationOptions: [...new Set([...running, ...syringeOptions(input.name, input.route).map(formatSyringe)])],
      concentrationLabel: input.syringeLabel,
      customConcentrationContent: typed && syringeAmountUnits(input.doseUnit).length
        ? <SyringeCustomFields name={input.name} route={input.route} doseUnit={input.doseUnit} color={input.color} onChange={label => input.setConcentration?.(label)} />
        : undefined,
    },
    customInvalid: typed && !parseSyringe(input.concentration),
  }
}
