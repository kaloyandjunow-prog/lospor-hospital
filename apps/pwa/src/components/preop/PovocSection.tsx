import { Text, View } from "react-native"
import { Controller, type Control } from "react-hook-form"
import { ClinicalYesNoRow } from "@/components/ClinicalYesNoRow"
import { colors, useThemeRefresh } from "@/theme/colors"
import type { PreopFormInput } from "@/lib/preop-form-schema"

/**
 * The three POVOC risk questions and the running score.
 *
 * The fourth factor, age at least three years, is derived from the recorded
 * age rather than asked, so it is shown as a read-out and not as a question.
 */
const POVOC_QUESTIONS = [
  ["povocSurgeryAtLeast30Minutes", "povocSurgery"],
  ["povocStrabismusSurgery", "povocStrabismus"],
  ["povocHistory", "povocHistory"],
] as const

export function PovocSection({ control, labels, povoc, isShown = () => true, unavailableLabel }: {
  control: Control<PreopFormInput>
  labels: Record<string, string>
  povoc: { score: number; riskPercent: number; factors: { ageAtLeast3Years: boolean } } | null
  /** Whether the hospital's preop profile asks this field's question. */
  isShown?: (field: string) => boolean
  /** Shown instead of the score when an input is switched off. */
  unavailableLabel?: string
}) {
  useThemeRefresh()
  const available = POVOC_QUESTIONS.every(([name]) => isShown(name))
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "900" }}>{labels.povoc}</Text>
        <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "900" }}>
          {povoc && available ? `${povoc.score}/4 - ${povoc.riskPercent}%` : "-"}
        </Text>
      </View>
      {!available && unavailableLabel ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>{unavailableLabel}</Text> : null}
      {POVOC_QUESTIONS.filter(([name]) => isShown(name)).map(([name, labelKey]) => (
        <Controller key={name} control={control} name={name} render={({ field }) => (
          <ClinicalYesNoRow label={labels[labelKey]} value={field.value ?? null} onValueChange={field.onChange} />
        )} />
      ))}
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
        {labels.povocAgeFactor}: {povoc?.factors.ageAtLeast3Years ? labels.yes : labels.no}
      </Text>
    </View>
  )
}
