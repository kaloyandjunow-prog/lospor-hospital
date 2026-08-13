import { Text, View } from "react-native"
import type { PatientReference } from "@/lib/patient-reference"
import { colors, withAlpha } from "@/theme/colors"

export function MaskedPatientReference({
  reference,
  language,
}: {
  reference?: PatientReference | null
  language: string
}) {
  if (!reference?.maskedIdentifier) return null
  return (
    <View style={{
      alignSelf: "flex-start",
      marginBottom: 10,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: withAlpha(colors.primary, "11"),
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, "44"),
    }}>
      <Text
        accessibilityLabel={language === "bg" ? "Маскиран болничен номер" : "Masked hospital patient number"}
        style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "700" }}
      >
        {language === "bg" ? "Пациент" : "Patient"}: {reference.maskedIdentifier}
      </Text>
    </View>
  )
}
