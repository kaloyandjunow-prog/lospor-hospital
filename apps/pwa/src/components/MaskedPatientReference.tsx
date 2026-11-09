import { Text, View } from "react-native"
import { STRINGS } from "@/i18n/strings"
import { patientDisplayLine, readPatientDisplay, type PatientReference } from "@/lib/patient-reference"
import { colors, withAlpha } from "@/theme/colors"

/** The ИЗ № line of a case row. */
export function PatientDisplayText({ display, language, testID }: { display?: unknown; language: string; testID?: string }) {
  const line = patientDisplayLine(readPatientDisplay(display), language)
  return line ? <Text testID={testID} style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "800", marginBottom: 4 }}>{line}</Text> : null
}

export function MaskedPatientReference({
  reference,
  display,
  language,
}: {
  reference?: PatientReference | null
  /** The case's `patientDisplay`, as the API sent it. */
  display?: unknown
  language: string
}) {
  if (!reference?.maskedIdentifier) return null
  const line = patientDisplayLine(readPatientDisplay(display) ?? reference.display, language)
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
      {line ? (
        <Text testID="patient-display" style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800", marginBottom: 3 }}>{line}</Text>
      ) : null}
      <Text
        accessibilityLabel={language === "bg" ? "Маскиран болничен номер" : "Masked hospital patient number"}
        style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "700" }}
      >
        {STRINGS[language as "en" | "bg"].patientLabel}: {reference.maskedIdentifier}
      </Text>
    </View>
  )
}
