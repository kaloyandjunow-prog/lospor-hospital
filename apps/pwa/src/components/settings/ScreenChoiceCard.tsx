import { Text, TouchableOpacity, View } from "react-native"
import { Card } from "@/components/ui"
import { colors } from "@/theme/colors"

export type ScreenChoice = { value: string; label: string }

/** A compact, explicit two-way view selector used by the interface settings. */
export function ScreenChoiceCard({
  title, value, options, onChange, testPrefix, compact = false, scopeLabel, selectedLabel,
}: {
  title: string
  value: string
  options: readonly ScreenChoice[]
  onChange: (value: string) => void
  testPrefix: string
  compact?: boolean
  scopeLabel?: string
  selectedLabel?: string
}) {
  const body = (
    <>
      <View style={{ paddingHorizontal: compact ? 0 : 16, paddingTop: compact ? 12 : 14, paddingBottom: compact ? 8 : 8, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800", flex: 1 }}>{title}</Text>
          {compact && selectedLabel ? <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "800" }}>{selectedLabel}</Text> : null}
        </View>
        {compact && scopeLabel ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>{scopeLabel}</Text> : null}
      </View>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 8, paddingHorizontal: compact ? 0 : 12, paddingBottom: compact ? 12 : 12 }}>
        {options.map(option => {
          const picked = value === option.value
          return (
            <TouchableOpacity
              key={option.value}
              testID={`${testPrefix}-${option.value}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: picked, selected: picked }}
              onPress={() => onChange(option.value)}
              style={{
                flex: 1,
                minHeight: 44,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                paddingHorizontal: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: picked ? colors.primary : colors.border,
                backgroundColor: picked ? colors.primarySoft : "transparent",
              }}
            >
              <View style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                borderWidth: 2,
                borderColor: picked ? colors.primary : colors.textMuted,
                alignItems: "center",
                justifyContent: "center",
              }}>
                {picked ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
              </View>
              <Text style={{ color: picked ? colors.primary : colors.textSecondary, flexShrink: 1, fontSize: 12, fontWeight: picked ? "800" : "700", textAlign: "center" }}>
                {option.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </>
  )
  return (
    compact ? <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>{body}</View> : <Card>{body}</Card>
  )
}
