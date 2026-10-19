import { Pressable, Text, View } from "react-native"
import { hapticTick } from "@/lib/haptic"
import { usePreferences } from "@/lib/preferences-context"
import { asaReasonLabel, type ASASuggestion } from "@/lib/preop-asa-suggestion"
import { colors, withAlpha, shadeLive as shade } from "@/theme/colors"

const ASA_OPTS: { v: "I"|"II"|"III"|"IV"|"V"|"VI"; color: string }[] = [
  { v: "I",   color: "#22c55e" },
  { v: "II",  color: "#84cc16" },
  { v: "III", color: "#f59e0b" },
  { v: "IV",  color: "#f97316" },
  { v: "V",   color: "#ef4444" },
  { v: "VI",  color: "#64748b" },
]

export function AsaPicker({
  value,
  onChange,
  emergencySurgery,
  suggestion,
  bmi,
  labelSuggested,
  labelSuggestedReview,
  labelEmergencySuffix,
}: {
  value?: string
  onChange: (v: string) => void
  emergencySurgery: boolean
  suggestion: ASASuggestion | null
  bmi?: number | null // the BMI reasons name the patient's own BMI
  labelSuggested: string
  labelSuggestedReview: string
  labelEmergencySuffix: string
}) {
  const { language } = usePreferences()
  return (
    <View style={{ gap: 8 }}>
      {/* A prompt to choose, gone once a class is chosen. */}
      {suggestion && !value && (
        <View style={{ backgroundColor: withAlpha(shade("#3b82f6"), "15"), borderRadius: 12, borderWidth: 1, borderColor: withAlpha(shade("#3b82f6"), "40"), paddingHorizontal: 12, paddingVertical: 10, gap: 4 }}>
          <Text style={{ color: shade("#60a5fa"), fontSize: 13, fontWeight: "800" }}>
            {labelSuggested} {suggestion.cls} {labelSuggestedReview}
          </Text>
          {suggestion.reasonCodes.map((code) => (
            <Text key={code} style={{ color: shade("#60a5fa"), fontSize: 12, opacity: 0.85 }}>• {asaReasonLabel(code, language === "bg" ? "bg" : "en", bmi)}</Text>
          ))}
        </View>
      )}
      {emergencySurgery && (
        <View style={{ backgroundColor: withAlpha(colors.danger, "10"), borderRadius: 10, borderWidth: 1, borderColor: withAlpha(colors.danger, "40"), paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>{labelEmergencySuffix}</Text>
        </View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {ASA_OPTS.map(({ v, color }) => {
          const selected = value === v
          const displayLabel = emergencySurgery && v !== "VI" ? `${v}E` : v
          return (
            <Pressable
              key={v}
              onPress={() => { hapticTick(); onChange(value === v ? "" : v) }}
              style={{
                flex: 1, minWidth: 52, minHeight: 56,
                alignItems: "center", justifyContent: "center",
                borderRadius: 14, borderCurve: "continuous",
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? color : colors.border,
                backgroundColor: selected ? withAlpha(color, "22") : colors.surface,
              }}
            >
              <Text style={{ color: selected ? color : colors.textSecondary, fontSize: 15, fontWeight: "900", letterSpacing: -0.3 }}>
                {displayLabel}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
