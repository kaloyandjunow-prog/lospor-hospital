import { View, Text } from "react-native"
import { STRINGS } from "@/i18n/strings"
import { usePreferences } from "@/lib/preferences-context"
import { colors } from "@/theme/colors"

// Single source of truth for the medical disclaimer shown in the selected UI
// language. Keep the English export for external metadata consumers.
export const MEDICAL_DISCLAIMER_TEXT = STRINGS.en.medicalDisclaimer

export function MedicalDisclaimer({ compact = false }: { compact?: boolean }) {
  const { t } = usePreferences()
  return (
    <View style={{
      borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      backgroundColor: colors.surfaceRaised, padding: compact ? 10 : 14,
    }}>
      <Text style={{ color: colors.textMuted, fontSize: compact ? 11 : 12, lineHeight: compact ? 16 : 18 }}>
        {t("medicalDisclaimer")}
      </Text>
    </View>
  )
}
