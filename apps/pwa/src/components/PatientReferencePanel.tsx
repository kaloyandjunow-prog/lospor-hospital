import { useState } from "react"
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native"
import { STRINGS } from "@/i18n/strings"
import { PatientEgnError, type PatientReference } from "@/lib/patient-reference"
import { colors, useShade, withAlpha } from "@/theme/colors"

type Props = {
  reference: PatientReference | null
  language: string
  onRelink: (patientNumber: string, correctionReason: string) => Promise<void>
  /** Present where the site permits ЕГН: lets a saved case get one. */
  onAddEgn?: (nationalId: string) => Promise<void>
  allowCorrection?: boolean
}

/** Shows the linked patient marker and requires an explicit confirmation to change it. */
export function PatientReferencePanel({ reference, language, onRelink, onAddEgn, allowCorrection = true }: Props) {
  const shade = useShade()
  const s = STRINGS[language as "en" | "bg"]
  const [editing, setEditing] = useState(false)
  const [patientNumber, setPatientNumber] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [egn, setEgn] = useState("")
  const [egnSaving, setEgnSaving] = useState(false)
  const [egnError, setEgnError] = useState<string | null>(null)
  const addEgn = async () => {
    if (!onAddEgn || !egn.trim() || egnSaving) return
    setEgnSaving(true)
    setEgnError(null)
    try {
      await onAddEgn(egn)
      setEgn("")
    } catch (failure) {
      const code = failure instanceof PatientEgnError ? failure.code : "FAILED"
      setEgnError(code === "INVALID_EGN" ? s.patientEgnInvalid : code === "TAKEN" ? s.patientEgnTaken : s.patientEgnFailed)
    } finally {
      setEgnSaving(false)
    }
  }

  const cancel = () => {
    setPatientNumber("")
    setConfirmation("")
    setReason("")
    setError(null)
    setEditing(false)
  }

  const confirm = async () => {
    if (!patientNumber.trim() || saving) return
    if (patientNumber.trim() !== confirmation.trim()) {
      setError(language === "bg"
        ? "Двата болнични номера не съвпадат."
        : "The two hospital patient numbers do not match.")
      return
    }
    // Recorded in the audit log, so a correction can be understood later.
    if (!reason.trim()) {
      setError(language === "bg"
        ? "Посочете причина за корекцията."
        : "State a reason for this correction.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onRelink(patientNumber, reason)
      cancel()
    } catch {
      // Never place the raw value or a server response into clinician-facing
      // diagnostics. The input remains only long enough to let them retry.
      setError(language === "bg"
        ? "Връзката с пациента не можа да бъде променена. Проверете номера и връзката."
        : "The patient link could not be changed. Check the number and connection.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={{
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, "55"),
      backgroundColor: withAlpha(colors.primary, "10"),
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800" }}>
        {s.linkedPatient}
      </Text>
      <Text
        accessibilityLabel={language === "bg" ? "Маскиран болничен номер" : "Masked hospital patient number"}
        style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "900", marginTop: 3 }}
      >
        {reference?.maskedIdentifier ?? (language === "bg" ? "Не е потвърден" : "Not confirmed")}
      </Text>
      {reference?.personMaskedIdentifier ? (
        <Text testID="patient-egn-masked" style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "800", marginTop: 4 }}>
          ЕГН {reference.personMaskedIdentifier}
        </Text>
      ) : onAddEgn ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
          <TextInput
            testID="add-patient-egn"
            accessibilityLabel="ЕГН"
            placeholder="ЕГН"
            placeholderTextColor={colors.textMuted}
            value={egn}
            onChangeText={value => { setEgn(value); if (egnError) setEgnError(null) }}
            maxLength={12}
            keyboardType="number-pad"
            editable={!egnSaving}
            style={{ flex: 1, color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}
          />
          <TouchableOpacity accessibilityRole="button" onPress={addEgn} disabled={egnSaving || !egn.trim()}
            style={{ borderRadius: 9, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: colors.primary, opacity: egnSaving || !egn.trim() ? 0.5 : 1 }}>
            {egnSaving ? <ActivityIndicator size="small" color={shade("#fff")} /> : <Text style={{ color: shade("#fff"), fontWeight: "900" }}>{s.patientEgnAdd}</Text>}
          </TouchableOpacity>
        </View>
      ) : null}
      {egnError ? <Text role="alert" style={{ color: colors.danger, fontSize: 11, marginTop: 6 }}>{egnError}</Text> : null}

      {!allowCorrection ? null : !editing ? (
        <TouchableOpacity onPress={() => setEditing(true)} style={{ marginTop: 10 }}>
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "800" }}>
            {s.correctPatientLink}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: colors.warning, fontSize: 12, lineHeight: 17, marginBottom: 8 }}>
            {s.patientLinkChangeWarning}
          </Text>
          <TextInput
            accessibilityLabel={language === "bg" ? "Нов болничен номер" : "New hospital patient number"}
            value={patientNumber}
            onChangeText={setPatientNumber}
            maxLength={128}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!saving}
            secureTextEntry
            style={{
              color: colors.textPrimary,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
          <TextInput
            accessibilityLabel={language === "bg" ? "Повторете новия болничен номер" : "Repeat new hospital patient number"}
            value={confirmation}
            onChangeText={setConfirmation}
            maxLength={128}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!saving}
            secureTextEntry
            style={{
              color: colors.textPrimary,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginTop: 8,
            }}
          />
          <TextInput
            accessibilityLabel={language === "bg" ? "Причина за корекцията" : "Reason for this correction"}
            placeholder={language === "bg" ? "Причина за корекцията" : "Reason for this correction"}
            placeholderTextColor={colors.textMuted}
            value={reason}
            onChangeText={setReason}
            maxLength={500}
            autoCorrect={false}
            editable={!saving}
            style={{
              color: colors.textPrimary,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginTop: 8,
            }}
          />
          {error ? <Text role="alert" style={{ color: colors.danger, fontSize: 11, marginTop: 6 }}>{error}</Text> : null}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={confirm}
              disabled={saving || !patientNumber.trim()}
              style={{
                flex: 1,
                alignItems: "center",
                borderRadius: 9,
                paddingVertical: 10,
                backgroundColor: colors.primary,
                opacity: saving || !patientNumber.trim() ? 0.5 : 1,
              }}
            >
              {saving
                ? <ActivityIndicator size="small" color={shade("#fff")} />
                : <Text style={{ color: shade("#fff"), fontWeight: "900" }}>
                    {s.confirmChange}
                  </Text>}
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={cancel}
              disabled={saving}
              style={{ alignItems: "center", borderRadius: 9, padding: 10, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: "800" }}>
                {s.cancel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  )
}
