import { View, Text } from "react-native"
import { colors } from "@/theme/colors"

// Single source of truth for the medical-device disclaimer. The app now actively
// suggests doses/rates, so this must be surfaced in-app (and mirrored in the
// store listing + privacy policy).
export const MEDICAL_DISCLAIMER_TEXT =
  "LOSPOR is a documentation and research tool, not a medical device. Any dose, rate, " +
  "or other clinical suggestion it shows is provided for convenience only and is not a " +
  "substitute for professional clinical judgement. The treating clinician remains solely " +
  "responsible for every clinical decision."

export function MedicalDisclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <View style={{
      borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      backgroundColor: colors.surfaceRaised, padding: compact ? 10 : 14,
    }}>
      <Text style={{ color: colors.textMuted, fontSize: compact ? 11 : 12, lineHeight: compact ? 16 : 18 }}>
        {MEDICAL_DISCLAIMER_TEXT}
      </Text>
    </View>
  )
}
