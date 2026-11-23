import { Text, TouchableOpacity } from "react-native"
import { colors } from "@/theme/colors"

/** The case's menu (Delete, Share, Anaesthesia team, ...) by a tap, not only a long press. */
export function CaseMenuButton({ caseId, label, onPress }: { caseId: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} testID={`case-menu-${caseId}`}
      onPress={onPress} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={{ minWidth: 44, minHeight: 44, marginVertical: -12, marginRight: -10, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: colors.textSecondary, fontSize: 20, fontWeight: "800" }}>⋯</Text>
    </TouchableOpacity>
  )
}
