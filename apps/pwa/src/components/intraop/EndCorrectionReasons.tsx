import { Pressable, Text, View } from "react-native"
import {
  INTRAOP_END_CORRECTION_REASONS,
  intraopEndCorrectionReasonLabel,
  type IntraopEndCorrectionReason,
} from "@lospor/core/intraop-end-correction"
import { usePreferences, type ClinicalStringKey } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

/**
 * Why the end of a case that has ended is being changed (10.1.0). Asked
 * before the change is saved; the reason goes to the audit log with the old
 * and new end. A fixed list, because free text in an audit record could carry
 * patient details.
 */
export function EndCorrectionReasons({ onChoose, onCancel, tc }: {
  onChoose: (reason: IntraopEndCorrectionReason) => void
  onCancel: () => void
  tc: (key: ClinicalStringKey) => string
}) {
  const shade = useShade()
  const { language } = usePreferences()
  return (
    <View testID="end-correction-reasons" style={{ marginBottom: 12, padding: 12, borderRadius: 12,
      backgroundColor: shade("#fbbf24") + "14", borderWidth: 1, borderColor: shade("#fbbf24") + "66" }}>
      <Text style={{ color: shade("#fbbf24"), fontWeight: "800", fontSize: 13, marginBottom: 8 }}>{tc("endCorrectionTitle")}</Text>
      {INTRAOP_END_CORRECTION_REASONS.map(reason => (
        <Pressable key={reason} testID={`end-correction-${reason}`} accessibilityRole="button" onPress={() => onChoose(reason)}
          style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12, marginBottom: 6, borderRadius: 10,
            backgroundColor: shade("#1c1c1c"), borderWidth: 1, borderColor: shade("#334155") }}>
          <Text style={{ color: shade("#e2e8f0"), fontSize: 13, fontWeight: "600" }}>{intraopEndCorrectionReasonLabel(reason, language)}</Text>
        </Pressable>
      ))}
      <Pressable testID="end-correction-cancel" accessibilityRole="button" onPress={onCancel}
        style={{ minHeight: 40, justifyContent: "center", alignItems: "center", marginTop: 2 }}>
        <Text style={{ color: shade("#94a3b8"), fontSize: 12, fontWeight: "700" }}>{tc("endCorrectionCancel")}</Text>
      </Pressable>
    </View>
  )
}
