import { View, Text, TouchableOpacity } from "react-native"
import { colors, withAlpha } from "@/theme/colors"
import { usePreferences } from "@/lib/preferences-context"

export function ClinicalYesNoRow({
  value,
  onValueChange,
  label,
  activeColor = colors.primary,
}: {
  value: boolean | null
  onValueChange: (value: boolean | null) => void
  label: string
  activeColor?: string
}) {
  const { tc } = usePreferences()
  const answered = value != null
  // Colour marks a positive finding only. A "no" is reassuring and an unanswered
  // question is not a finding at all, so neither should draw the eye the way a
  // recorded allergy does.
  const accent = value === true ? activeColor : colors.textSecondary

  const option = (optionValue: boolean, text: string) => {
    const selected = value === optionValue
    return (
      <TouchableOpacity
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={`${label}: ${text}`}
        onPress={() => onValueChange(selected ? null : optionValue)}
        style={{
          minWidth: 54, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10,
          alignItems: "center",
          backgroundColor: selected ? withAlpha(accent, "22") : "transparent",
          borderWidth: 1,
          borderColor: selected ? accent : colors.border,
        }}
      >
        <Text style={{ color: selected ? accent : colors.textMuted, fontSize: 13, fontWeight: "800" }}>
          {text}
        </Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={{
      flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: value === true ? activeColor : colors.border,
      borderRadius: 14, borderCurve: "continuous",
      paddingHorizontal: 14, paddingVertical: 10,
    }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: value === true ? activeColor : colors.textSecondary, fontSize: 14, fontWeight: "800" }}>
          {label}
        </Text>
        {/* Says out loud that nothing has been recorded, so a blank row cannot
            be mistaken for a completed one on a form of forty questions. */}
        {!answered && (
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{tc("notAsked")}</Text>
        )}
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {option(true, tc("answerYes"))}
        {option(false, tc("answerNo"))}
      </View>
    </View>
  )
}
