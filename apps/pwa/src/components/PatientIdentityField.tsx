import { Text } from "react-native"
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

  return (
    <Field
      label={language === "bg" ? "Болничен номер на пациента" : "Hospital patient number"}
      required
      error={error}
    >
      <Controller control={control} name="patientNumber" render={({ field }) => (
        <>
          <StyledInput
            value={field.value ?? ""}
            onChangeText={field.onChange}
            maxLength={128}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 6 }}>
            {STRINGS[language as "en" | "bg"].patientNumberPseudonymNote}
          </Text>
        </>
      )} />
    </Field>
  )
}
