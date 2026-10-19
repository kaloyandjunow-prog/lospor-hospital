import { Text, TouchableOpacity, View } from "react-native"
import { GUPTA_PROCEDURE_TYPE_QUESTION, GUPTA_PROCEDURE_TYPES, guptaFromForm } from "@lospor/core/gupta"
import { isGuptaEnabled, type PreopAssessmentProfile } from "@lospor/core/preop-assessment"
import { displayGuptaRisk } from "@lospor/core/risk-band-display"
import { riskColor } from "@/lib/case-detail-summary"
import { toClinicalLocale } from "@/lib/clinical-display"
import type { ClinicalStringKey } from "@/i18n/clinical-strings"
import { colors, useThemeRefresh } from "@/theme/colors"
import type { PreopQuestionAnswer } from "./PreopQuestionList"

/**
 * Gupta MICA, shown only where the operator switched on both of its questions
 * (the same card as web's GuptaRiskCard). Its two answers are drawn by the
 * question list above it; age, ASA and creatinine come from the form. The risk
 * is worked out here and never sent: only the inputs are stored.
 */
export function GuptaRiskCard({
  profile,
  values,
  onAnswer,
  tc,
  language,
}: {
  profile: Pick<PreopAssessmentProfile, "questions"> | null | undefined
  values: Record<string, unknown>
  onAnswer: (stableKey: string, answer: PreopQuestionAnswer | null) => void
  tc: (key: ClinicalStringKey) => string
  language: string
}) {
  useThemeRefresh()
  if (!isGuptaEnabled(profile)) return null
  const { result, suggestedProcedureType } = guptaFromForm(values)
  const typeLabel = (key: string) => {
    const type = GUPTA_PROCEDURE_TYPES.find(item => item.key === key)
    return type ? (language === "bg" ? type.labelBg : type.labelEn) : key
  }
  const answeredType = Array.isArray(values.preopAnswers)
    && values.preopAnswers.some(answer => answer?.stableKey === GUPTA_PROCEDURE_TYPE_QUESTION && answer?.state === "YES")
  const shown = result.available ? displayGuptaRisk(result.percent, toClinicalLocale(language)) : null
  const missingKey: Record<string, ClinicalStringKey> = {
    age: "guptaAge", asa: "guptaAsa", functionalStatus: "guptaFunctionalStatus", procedureType: "guptaProcedureType",
  }

  return (
    <View testID="gupta-risk-card" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 15, padding: 12, marginBottom: 14 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "900" }}>{tc("guptaTitle")}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{tc("guptaNote")}</Text>
      {shown ? (
        <Text style={{ color: riskColor(shown.severity), fontSize: 18, fontWeight: "900", marginTop: 6 }}>{shown.label}</Text>
      ) : (
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 6 }}>
          {tc("guptaMissing").replace("{inputs}", result.available ? "" : result.missing.map(item => tc(missingKey[item])).join(", "))}
        </Text>
      )}
      {result.available && result.input.creatinine === "UNKNOWN" ? (
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{tc("guptaCreatinineUnknown")}</Text>
      ) : null}
      {suggestedProcedureType && !answeredType ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
          <Text style={{ color: colors.warning, fontSize: 12 }}>{tc("guptaSuggested").replace("{type}", typeLabel(suggestedProcedureType))}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => onAnswer(GUPTA_PROCEDURE_TYPE_QUESTION, { stableKey: GUPTA_PROCEDURE_TYPE_QUESTION, state: "YES", optionKey: suggestedProcedureType })}
          >
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>{tc("guptaUse")}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  )
}
