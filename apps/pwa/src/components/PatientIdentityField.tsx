import { Pressable, Text, View } from "react-native"
import { Controller, type Control } from "react-hook-form"
import { STRINGS } from "@/i18n/strings"
import type { PreopFormInput } from "@/lib/preop-form-schema"
import { relinkCasePatientReference, type PatientReference } from "@/lib/patient-reference"
import { colors } from "@/theme/colors"
import { Field, StyledInput } from "./ui"
import { PatientReferencePanel } from "./PatientReferencePanel"

type Props = {
  caseId: string | null
  control: Control<PreopFormInput>
  error?: string
  language: string
  reference: PatientReference | null
  onReferenceChange: (reference: PatientReference) => void
  allowCorrection: boolean
  /** Which numbering the typed number belongs to. */
  identifierType: "IZ" | "EGN"
  onIdentifierTypeChange: (kind: "IZ" | "EGN") => void
  /** Whether this site permits linking by national identifier at all. */
  egnPermitted: boolean
}

/** Keeps patient identity entry/relinking separate from the clinical form UI. */
export function PatientIdentityField({
  caseId,
  control,
  error,
  language,
  reference,
  onReferenceChange,
  allowCorrection,
  identifierType,
  onIdentifierTypeChange,
  egnPermitted,
}: Props) {
  if (caseId) {
    return (
      <PatientReferencePanel
        reference={reference}
        language={language}
        allowCorrection={allowCorrection}
        onRelink={async (patientNumber, correctionReason) => {
          onReferenceChange(await relinkCasePatientReference(
            caseId, reference?.id ?? "", patientNumber, correctionReason,
          ))
        }}
      />
    )
  }

  const label = language === "bg" ? "Болничен номер на пациента" : "Hospital patient number"

  return (
    <Field
      label={label}
      required
      error={error}
    >
      {/* Which numbering this is.

          Only where the site permits national identifiers. The API has
          accepted both since the adapter existed and the policy has defaulted
          to permitting both, but no client ever sent anything but IZ -- so an
          ЕГН typed here was looked up as a record number, found nothing, and
          there was no way to say what it actually was. */}
      {egnPermitted ? (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          {(["IZ", "EGN"] as const).map(kind => (
            <Pressable
              key={kind}
              accessibilityRole="radio"
              accessibilityState={{ selected: identifierType === kind }}
              onPress={() => onIdentifierTypeChange(kind)}
              style={{
                borderRadius: 10,
                borderWidth: 1,
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderColor: identifierType === kind ? colors.primary : colors.border,
                backgroundColor: identifierType === kind ? colors.primarySoft : "transparent",
              }}
            >
              <Text style={{
                color: identifierType === kind ? colors.primary : colors.textSecondary,
                fontWeight: "700",
                fontSize: 12,
              }}>
                {kind === "IZ"
                  ? STRINGS[language as "en" | "bg"].patientNumberKindRecord
                  : STRINGS[language as "en" | "bg"].patientNumberKindEgn}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Controller control={control} name="patientNumber" render={({ field }) => (
        <>
          <StyledInput
            value={field.value ?? ""}
            onChangeText={field.onChange}
            maxLength={128}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel={label}
          />
          <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 6 }}>
            {STRINGS[language as "en" | "bg"].patientNumberPseudonymNote}
          </Text>
        </>
      )} />
    </Field>
  )
}
