import { Text, TouchableOpacity, View } from "react-native"
import { daysBetweenDateKeys, dayStepLabel, shiftDateKey } from "@lospor/core/intraop-time"
import { useShade } from "@/theme/shade"

/**
 * A date as a day stepper: ‹ Today ›. One tap back is "Yesterday", then
 * "Tue 14.10" -- no calendar to hunt through (the same control as web's
 * DayStepper). `min` and `max` are calendar dates (YYYY-MM-DD) it will not pass.
 */
export function DayStepper({
  value,
  onChange,
  todayKey,
  min,
  max,
  language,
  label,
  disabled = false,
  testID,
}: {
  value: string
  onChange: (key: string) => void
  todayKey: string
  min?: string | null
  max?: string | null
  language: string
  label: string
  disabled?: boolean
  testID?: string
}) {
  const shade = useShade()
  const previous = shiftDateKey(value, -1)
  const next = shiftDateKey(value, 1)
  const canGoBack = !disabled && previous != null && (min == null || (daysBetweenDateKeys(min, previous) ?? -1) >= 0)
  const canGoForward = !disabled && next != null && (max == null || (daysBetweenDateKeys(next, max) ?? -1) >= 0)
  const shown = dayStepLabel(value, todayKey, language === "bg" ? "bg" : "en")
  const arrow = (enabled: boolean, glyph: string, onPress: () => void, hint: string) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${hint}`}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: enabled ? 1 : 0.3 }}
    >
      <Text style={{ color: shade("#93c5fd"), fontSize: 22, fontWeight: "900" }}>{glyph}</Text>
    </TouchableOpacity>
  )
  return (
    <View testID={testID} accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
      backgroundColor: shade("#111111"), borderRadius: 10, borderWidth: 1, borderColor: shade("#2a3a4a"), marginBottom: 8 }}>
      {arrow(canGoBack, "‹", () => { if (previous) onChange(previous) }, "−1")}
      <Text style={{ minWidth: 96, textAlign: "center", fontSize: 15, fontWeight: "800",
        color: shown.kind === "today" ? shade("#f8fafc") : shade("#fbbf24") }}>{shown.text}</Text>
      {arrow(canGoForward, "›", () => { if (next) onChange(next) }, "+1")}
    </View>
  )
}
