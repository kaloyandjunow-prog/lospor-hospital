import { Text, TouchableOpacity, View } from "react-native"
import {
  isPreopChoiceQuestion,
  preopQuestionProgress,
  preopQuestionRows,
  type PreopAnswerState,
  type PreopAssessmentProfile,
  type PreopFormSection,
  type PreopProfileQuestion,
} from "@lospor/core/preop-assessment"
import { ClinicalYesNoRow } from "@/components/ClinicalYesNoRow"
import { PreopChoiceRow } from "@/components/preop/PreopChoiceRow"
import { SectionHeader } from "@/components/ui"
import type { ClinicalStringKey } from "@/i18n/clinical-strings"
import { colors, withAlpha, useThemeRefresh } from "@/theme/colors"

export type PreopQuestionAnswer = {
  stableKey: string
  state: "YES" | "NO" | "UNKNOWN" | "NOT_APPLICABLE"
  optionKey?: string | null
}

export type PreopPendingSuggestion = {
  id: string
  stableKey: string
  proposedState: PreopAnswerState | null
}

/**
 * The bundled questions the hospital switched on, as yes/no rows in the
 * section they belong to. Which rows appear -- operator order, population,
 * follow-ups only under a YES -- is decided in core, so web and this app draw
 * the same form. A section with nothing switched on draws nothing.
 */
export function PreopQuestionList({
  profile,
  formSection,
  mode,
  states,
  optionKeys,
  onAnswer,
  suggestions = [],
  onReviewSuggestion,
  tc,
  language,
  ageYears,
  sex,
  groups,
}: {
  profile: Pick<PreopAssessmentProfile, "questions"> | null | undefined
  formSection: PreopFormSection
  mode: "ADULT" | "PEDIATRIC"
  states: ReadonlyMap<string, PreopAnswerState>
  /** The option an answered choice question holds (preopAnswerOptionKeys). */
  optionKeys?: ReadonlyMap<string, string>
  onAnswer: (stableKey: string, answer: PreopQuestionAnswer | null) => void
  suggestions?: readonly PreopPendingSuggestion[]
  onReviewSuggestion?: (suggestionId: string, status: "ACCEPTED" | "REJECTED") => void
  tc: (key: ClinicalStringKey) => string
  language: string
  /** The case's age; a question asked only from an age is left off younger patients. */
  ageYears?: number | null
  /** The case's sex; pregnancy and breastfeeding are not asked of a man (10.0.0). */
  sex?: string | null
  /** Only one catalogue group, or all but one: the MH group has its own heading (10.0.0). */
  groups?: { only?: string; except?: string }
}) {
  useThemeRefresh()
  const rows = preopQuestionRows(profile, formSection, mode, states, ageYears, sex)
    .filter(row => (!groups?.only || row.question.section === groups.only) && row.question.section !== groups?.except)
  if (rows.length === 0) return null
  const progress = preopQuestionProgress(rows, states)
  const label = (question: PreopProfileQuestion) =>
    `${language === "bg" ? question.labelBg : question.labelEn}${question.required ? " *" : ""}`
  const groupLabel = (group: string) => {
    const key = `preopGroup${group}` as ClinicalStringKey
    const text = tc(key)
    return text && text !== key ? text : group
  }

  let previousGroup: string | null = null
  const sectionGroups = new Set(rows.filter(row => row.depth === 0).map(row => row.question.section))

  return (
    <View testID={`preop-questions-${formSection}`} style={{ marginTop: 6 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: "right", marginBottom: 4 }}>
        {tc("preopQuestionsAnswered").replace("{answered}", String(progress.answered)).replace("{total}", String(progress.total))}
      </Text>
      {rows.map(({ question, depth }) => {
        const state = states.get(question.stableKey)
        const heading = depth === 0 && sectionGroups.size > 1 && !groups?.only && question.section !== previousGroup
          ? <SectionHeader title={groupLabel(question.section)} />
          : null
        if (depth === 0) previousGroup = question.section
        // Offered only on an unanswered question: the clinician's own answer
        // wins, and accepting would otherwise overwrite it on the next save.
        const pending = state == null || state === "NOT_ASKED"
          ? suggestions.find(item => item.stableKey === question.stableKey)
          : undefined
        const answer = (next: PreopQuestionAnswer["state"] | null) =>
          onAnswer(question.stableKey, next
            ? { stableKey: question.stableKey, state: next, optionKey: next === "YES" || next === "NO" ? next : null }
            : null)
        const pill = (target: "UNKNOWN" | "NOT_APPLICABLE", text: string) => (
          <TouchableOpacity
            accessibilityRole="radio"
            accessibilityState={{ selected: state === target }}
            accessibilityLabel={`${label(question)}: ${text}`}
            onPress={() => answer(state === target ? null : target)}
            style={{
              paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1,
              borderColor: state === target ? colors.primary : colors.border,
              backgroundColor: state === target ? withAlpha(colors.primary, "22") : "transparent",
            }}
          >
            <Text style={{ color: state === target ? colors.primary : colors.textMuted, fontSize: 11, fontWeight: "700" }}>{text}</Text>
          </TouchableOpacity>
        )
        return (
          <View key={question.stableKey} testID={`preop-question-${question.stableKey}`}>
            {heading}
            <View style={depth === 1 ? { marginLeft: 18, borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: 10 } : undefined}>
              {isPreopChoiceQuestion(question) ? (
                // Not yes/no: one of the question's own options, stored as YES + option key.
                <PreopChoiceRow
                  question={question}
                  label={label(question)}
                  value={state === "YES" ? optionKeys?.get(question.stableKey) ?? null : null}
                  language={language}
                  placeholder={tc("preopChoose")}
                  onChange={optionKey => onAnswer(question.stableKey, optionKey ? { stableKey: question.stableKey, state: "YES", optionKey } : null)}
                />
              ) : (
                <ClinicalYesNoRow
                  label={label(question)}
                  value={state === "YES" ? true : state === "NO" ? false : null}
                  onValueChange={value => answer(value == null ? null : value ? "YES" : "NO")}
                />
              )}
              {question.allowUnknown || question.allowNotApplicable ? (
                <View style={{ flexDirection: "row", gap: 6, marginTop: -4, marginBottom: 8 }}>
                  {question.allowUnknown ? pill("UNKNOWN", tc("preopUnknown")) : null}
                  {question.allowNotApplicable ? pill("NOT_APPLICABLE", tc("preopNotApplicable")) : null}
                </View>
              ) : null}
              {pending && onReviewSuggestion ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
                  <Text style={{ color: colors.warning, fontSize: 12 }}>
                    {tc("preopSuggestionFromRecord").replace("{answer}", pending.proposedState === "NO" ? tc("answerNo") : tc("answerYes"))}
                  </Text>
                  <TouchableOpacity accessibilityRole="button" onPress={() => onReviewSuggestion(pending.id, "ACCEPTED")}>
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>{tc("preopSuggestionAccept")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" onPress={() => onReviewSuggestion(pending.id, "REJECTED")}>
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700" }}>{tc("preopSuggestionReject")}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </View>
        )
      })}
    </View>
  )
}
