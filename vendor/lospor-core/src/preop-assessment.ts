/** Shared wire contract for the API-owned, definition-driven preoperative assessment. */
export type PreopAnswerState = "YES" | "NO" | "UNKNOWN" | "NOT_APPLICABLE" | "NOT_ASKED"

export type PreopProfileQuestion = {
  stableKey: string
  enabled: boolean
  required: boolean
  sortOrder: number
  labelEn: string
  labelBg: string
  answerType: "BOOLEAN" | "CHOICE" | "NUMBER" | "TEXT" | "DATE"
  applicability: string[]
  allowUnknown: boolean
  allowNotApplicable: boolean
  conditionalRuleKey: string | null
  omopDomain: string | null
  omopConceptId: number | null
  omopSourceCode: string | null
  options: Array<{
    key: string
    labelEn: string
    labelBg: string
    omopConceptId: number | null
    omopVocabulary: string | null
    omopSourceCode: string | null
  }>
}

export type PreopAssessmentProfile = {
  id: string
  version: number
  catalogVersion: string
  status: "DRAFT" | "PUBLISHED" | "RETIRED"
  publishedAt: string | null
  questions: PreopProfileQuestion[]
}

export type PreopAnswerInput = {
  stableKey: string
  state: Exclude<PreopAnswerState, "NOT_ASKED">
  optionKey?: string | null
  valueText?: string | null
  valueNumber?: number | null
  valueDate?: string | null
}

export type PreopSuggestionSummary = {
  id: string
  stableKey: string
  proposedState: PreopAnswerState | null
  proposedOptionKey: string | null
  evidence: unknown
  ruleId: string
  ruleVersion: string
  status: "PENDING" | "ACCEPTED" | "REJECTED"
  createdAt: string
}
