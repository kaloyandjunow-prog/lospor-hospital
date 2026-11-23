import React from "react"
import { Text, View } from "react-native"
import { casePresenceLabel } from "@lospor/core/case-presence"
import { colors, withAlpha } from "@/theme/colors"
import { usePreferences } from "@/lib/preferences-context"
import { useCasePresence } from "@/lib/use-case-presence"

/** "Case open by: ..." above a case while more than one screen is on it (10.8.0). Not a lock: only a notice. */
export function CasePresenceBanner({ caseId, enabled = true }: { caseId: string; enabled?: boolean }) {
  const { language } = usePreferences()
  const label = casePresenceLabel(useCasePresence(caseId, enabled), language === "bg" ? "bg" : "en")
  if (!label) return null
  return (
    <View testID="case-presence" accessibilityRole="alert" style={{ marginHorizontal: 16, marginVertical: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: withAlpha(colors.primary, "55"), backgroundColor: withAlpha(colors.primary, "18") }}>
      <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700" }}>{label}</Text>
    </View>
  )
}
