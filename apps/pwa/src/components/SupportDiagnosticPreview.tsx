import { Text, View } from "react-native"
import { colors } from "@/theme/colors"

export function SupportDiagnosticPreview({
  title,
  notice,
  report,
}: {
  title: string
  notice: string
  report: string
}) {
  return (
    <View
      accessibilityLabel={title}
      style={{
        backgroundColor: colors.surfaceRaised,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        padding: 16,
      }}
    >
      <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 6 }}>
        {title}
      </Text>
      <Text style={{ color: colors.success, fontSize: 12, lineHeight: 17, marginBottom: 12 }}>
        {notice}
      </Text>
      <Text selectable style={{ color: colors.textSecondary, fontFamily: "monospace", fontSize: 11, lineHeight: 17 }}>
        {report}
      </Text>
    </View>
  )
}
