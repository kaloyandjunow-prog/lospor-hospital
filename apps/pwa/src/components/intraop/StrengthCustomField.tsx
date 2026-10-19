import { useEffect, useMemo, useRef, useState } from "react"
import { Text, TouchableOpacity, View } from "react-native"
import { customStrength, customStrengthField } from "@lospor/core/strength-entry"
import { VitalStepper } from "@/components/VitalStepper"
import { formatMessage } from "@/i18n/locale"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

/**
 * A strength typed with Other (2026-10-18): a local anaesthetic's or a fluid's
 * %, or a drug's mg/mL, entered like a dose -- one-tap values, the slider and
 * the number tapped for the keypad, prefilled -- rather than free text. A
 * number typed outside the drug's range is brought to its nearest limit, and
 * the keypad says so.
 * Reports the number alone, as the typed box did; empty while unusable.
 */
export function StrengthCustomField({ name, unit, options, color, onChange }: {
  name?: string
  unit?: string
  options: string[]
  color: string
  onChange: (value: string) => void
}) {
  const { tc } = usePreferences()
  const shade = useShade()
  const field = useMemo(() => customStrengthField({ name, unit, options }), [name, unit, options])
  const [value, setValue] = useState<number | null>(field?.prefill ?? null)
  const result = field ? customStrength(field, value) : null
  const reported = result && "value" in result ? String(result.value) : ""
  // Reports the entry, not the callback: the latest onChange is kept in a ref.
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })
  useEffect(() => { onChangeRef.current(reported) }, [reported])

  if (!field) return null
  const precision = Math.max(0, String(field.step).split(".")[1]?.length ?? 0)
  return (
    <View testID="strength-custom-field" style={{ marginTop: 10, gap: 8 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {field.quickValues.map(quick => (
          <TouchableOpacity key={quick} testID={`strength-custom-pill-${quick}`} accessibilityRole="button" accessibilityState={{ selected: value === quick }}
            onPress={() => setValue(quick)}
            style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: color + "55", backgroundColor: value === quick ? color : color + "1a" }}>
            <Text style={{ color: value === quick ? shade("#fff") : color, fontWeight: "700", fontSize: 13 }}>{quick}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <VitalStepper value={value} onChange={setValue} min={field.min} max={field.max}
        step={field.step} precision={precision} unit={field.unit} placeholder={tc("doseCustomConcentration")} />
      {result && "error" in result ? (
        <Text testID="strength-custom-error" accessibilityRole="alert" style={{ color: shade("#f87171"), fontSize: 12 }}>
          {formatMessage(tc("strengthOutOfRange"), { min: field.min, max: field.max, unit: field.unit })}
        </Text>
      ) : null}
    </View>
  )
}
