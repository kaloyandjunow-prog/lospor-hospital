import { useState } from "react"
import { Text, TouchableOpacity, View } from "react-native"
import type { PreopProfileQuestion } from "@lospor/core/preop-assessment"
import { colors, withAlpha, useThemeRefresh } from "@/theme/colors"

/**
 * A catalogue question answered with one of its own options rather than yes
 * or no (Gupta's functional status and procedure type). Closed it shows the
 * label and the current choice, one tap opens the options; a long list
 * (21 procedure types) stays out of the way until it is needed.
 */
export function PreopChoiceRow({
  question,
  label,
  value,
  language,
  placeholder,
  onChange,
}: {
  question: Pick<PreopProfileQuestion, "stableKey" | "options">
  label: string
  value: string | null
  language: string
  placeholder: string
  onChange: (optionKey: string | null) => void
}) {
  useThemeRefresh()
  const [open, setOpen] = useState(false)
  const text = (option: PreopProfileQuestion["options"][number]) => language === "bg" ? option.labelBg : option.labelEn
  const chosen = question.options.find(option => option.key === value)

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "600", marginBottom: 6 }}>{label}</Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}: ${chosen ? text(chosen) : placeholder}`}
        testID={`preop-choice-${question.stableKey}`}
        onPress={() => setOpen(current => !current)}
        style={{
          paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
          borderColor: chosen ? colors.primary : colors.border,
          backgroundColor: chosen ? withAlpha(colors.primary, "14") : colors.surfaceRaised,
        }}
      >
        <Text style={{ color: chosen ? colors.primary : colors.textMuted, fontSize: 14, fontWeight: "700" }}>
          {chosen ? text(chosen) : placeholder}
        </Text>
      </TouchableOpacity>
      {open ? (
        <View style={{ marginTop: 6, gap: 4 }}>
          {question.options.map(option => {
            const selected = option.key === value
            return (
              <TouchableOpacity
                key={option.key}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => { onChange(selected ? null : option.key); setOpen(false) }}
                style={{
                  paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8,
                  backgroundColor: selected ? withAlpha(colors.primary, "22") : "transparent",
                }}
              >
                <Text style={{ color: selected ? colors.primary : colors.textSecondary, fontSize: 14, fontWeight: selected ? "800" : "500" }}>
                  {text(option)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}
