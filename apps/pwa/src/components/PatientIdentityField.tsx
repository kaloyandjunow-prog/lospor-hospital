import { useState } from "react"
import { Text, View } from "react-native"
import { egnFieldIssue } from "@/lib/egn-field"
import { Controller, type Control } from "react-hook-form"
import { STRINGS } from "@/i18n/strings"
import type { PreopFormInput } from "@/lib/preop-form-schema"
import { addCasePatientEgn, relinkCasePatientReference, type PatientReference } from "@/lib/patient-reference"
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
  /** Whether this site permits linking by national identifier (ЕГН) at all. */
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
  egnPermitted,
}: Props) {
  // An unfinished ЕГН is only called unfinished once the field is left.
  const [egnLeft, setEgnLeft] = useState(false)
  if (caseId) {
    return (
      <PatientReferencePanel
        reference={reference}
        language={language}
        allowCorrection={allowCorrection}
        onAddEgn={egnPermitted ? async nationalId => {
          const personMaskedIdentifier = await addCasePatientEgn(caseId, nationalId)
          if (reference) onReferenceChange({ ...reference, personMaskedIdentifier })
        } : undefined}
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
      {/* The ЕГН joins this patient's admissions across years; the record
          number restarts every January. Optional, and only where the site
          permits national identifiers. */}
      {egnPermitted ? (
        <Controller control={control} name="patientNationalId" render={({ field }) => {
          // A typo shows while it is typed (the server's rule), never as an
          // "Invalid request" once the whole preop form is filled.
          const issue = egnFieldIssue(field.value, egnLeft)
          const s = STRINGS[language as "en" | "bg"]
          return (
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800", marginBottom: 4 }}>ЕГН</Text>
              <StyledInput
                value={field.value ?? ""}
                onChangeText={field.onChange}
                onBlur={() => { setEgnLeft(true); field.onBlur() }}
                maxLength={12}
                keyboardType="number-pad"
                autoCorrect={false}
                accessibilityLabel="ЕГН"
                testID="patient-egn"
              />
              {issue ? (
                <Text role="alert" testID="patient-egn-error" style={{ color: colors.danger, fontSize: 11, lineHeight: 16, marginTop: 6 }}>
                  {issue === "invalid" ? s.patientEgnInvalid : s.patientEgnIncomplete}
                </Text>
              ) : (
                <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 6 }}>
                  {s.patientEgnHint}
                </Text>
              )}
            </View>
          )
        }} />
      ) : null}
    </Field>
  )
}
