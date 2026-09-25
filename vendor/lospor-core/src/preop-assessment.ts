/** Shared wire contract for the API-owned, definition-driven preoperative assessment. */
export type PreopAnswerState = "YES" | "NO" | "UNKNOWN" | "NOT_APPLICABLE" | "NOT_ASKED"

/** Core canonical preoperative sections; each client maps them onto its own tabs. */
export type PreopFormSection =
  | "demographics"
  | "case_details"
  | "medical_history"
  | "current_medications"
  | "anamnesis"
  | "physical_exam"
  | "airway"
  | "labs"
  | "risk_scores"

export type PreopProfileQuestion = {
  stableKey: string
  enabled: boolean
  required: boolean
  sortOrder: number
  /** Catalogue grouping, used as the sub-heading inside a form section. */
  section: string
  formSection: PreopFormSection
  /** Follow-ups: the question whose YES shows this one. */
  parentKey: string | null
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

/** The appliance's one profile: which bundled questions are on, their order, which are required. */
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

/** A required question still unanswered, as the case read reports it for the continue-to-intraop gate. */
export type PreopRequiredMissing = {
  stableKey: string
  labelEn: string
  labelBg: string
  fields: string[]
}

/**
 * Baseline questions answered through an existing form control, by the preop
 * field that control writes. The forms keep these controls; the profile only
 * decides whether they are shown. Everything else in the catalogue is answered
 * through `preopAnswers`.
 */
export const PREOP_LEGACY_FIELD_BY_QUESTION: Readonly<Record<string, string>> = Object.freeze({
  BASE_ALLERGIES: "allergies",
  BASE_LATEX_ALLERGY: "latexAllergy",
  BASE_FAMILY_ANAESTHESIA_PROBLEMS: "familyAnesthesiaProblems",
  BASE_UNEXPLAINED_ANAESTHESIA_COMPLICATIONS: "unexplainedAnaesthesiaComplications",
  BASE_MALIGNANT_HYPERTHERMIA_HISTORY: "malignantHyperthermiaHistory",
  BASE_ANTICIPATED_DIFFICULT_AIRWAY: "anticipatedDifficultAirway",
  BASE_DENTAL_PROSTHETICS: "dentalProsthetics",
  BASE_LOOSE_TEETH: "looseTeeth",
  BASE_SMOKING: "smoking",
  BASE_SUBSTANCE_ABUSE: "substanceAbuse",
  BASE_HEART_ARRHYTHMIA: "heartArrhythmia",
  BASE_RCRI_ISCHEMIC_HEART: "rcriIschemicHeart",
  BASE_RCRI_CHF: "rcriCHF",
  BASE_RCRI_CVD: "rcriCVD",
  BASE_RCRI_INSULIN_DM: "rcriInsulinDM",
  BASE_RCRI_CREATININE: "rcriCreatinine",
  BASE_APFEL_PONV_HISTORY: "apfelPONVHistory",
  BASE_APFEL_POSTOP_OPIOIDS: "apfelPostopOpioids",
  BASE_STOPBANG_SNORING: "stopbangSnoring",
  BASE_STOPBANG_TIRED: "stopbangTired",
  BASE_STOPBANG_OBSERVED: "stopbangObserved",
  BASE_STOPBANG_BP: "stopbangBP",
  BASE_STOPBANG_NECK: "stopbangNeck",
  BASE_POVOC_SURGERY_30_MINUTES: "povocSurgeryAtLeast30Minutes",
  BASE_POVOC_STRABISMUS_SURGERY: "povocStrabismusSurgery",
  BASE_POVOC_HISTORY: "povocHistory",
  BASE_COLDS_APPLICABLE: "coldsApplicable",
})

/** Baseline questions with a specialised control rather than a legacy yes/no field. */
const SPECIALISED_BASELINE = new Set(["BASE_SURGERY_URGENCY", "BASE_SURGERY_RISK", "BASE_PEDIATRIC_FASTING"])

/** Whether the question is answered through its own form control (so not drawn as a generic row). */
export function hasDedicatedPreopControl(stableKey: string): boolean {
  return stableKey in PREOP_LEGACY_FIELD_BY_QUESTION || SPECIALISED_BASELINE.has(stableKey)
}

/** Whether a question belongs to a case of this clinical mode (unknown mode: every question). */
export function preopQuestionAppliesToMode(applicability: readonly string[], mode: string | null | undefined): boolean {
  return applicability.length === 0 || !mode || applicability.includes(mode)
}

/**
 * Whether a question is shown on this case's form. Without a profile (an old
 * server, or before the case read arrives) every question the form already had
 * stays visible, which is the bundled default.
 */
export function isPreopQuestionShown(
  profile: Pick<PreopAssessmentProfile, "questions"> | null | undefined,
  stableKey: string,
  mode: string | null | undefined,
): boolean {
  if (!profile) return true
  const question = profile.questions.find(item => item.stableKey === stableKey)
  if (!question) return true
  return question.enabled && preopQuestionAppliesToMode(question.applicability, mode)
}

/** Whether a question is required on this case's form. */
export function isPreopQuestionRequired(
  profile: Pick<PreopAssessmentProfile, "questions"> | null | undefined,
  stableKey: string,
  mode: string | null | undefined,
): boolean {
  const question = profile?.questions.find(item => item.stableKey === stableKey)
  return Boolean(question?.required && isPreopQuestionShown(profile, stableKey, mode))
}

/**
 * The state of every question as the form currently holds it: generic answers
 * from `preopAnswers`, baseline answers from their legacy fields. A follow-up
 * of a baseline question (A6 under unexplained anaesthesia complications)
 * reads its parent from here too.
 */
export function preopAnswerStates(values: Record<string, unknown>): Map<string, PreopAnswerState> {
  const states = new Map<string, PreopAnswerState>()
  for (const [stableKey, field] of Object.entries(PREOP_LEGACY_FIELD_BY_QUESTION)) {
    const value = values[field]
    if (value === true) states.set(stableKey, "YES")
    else if (value === false && field !== "coldsApplicable") states.set(stableKey, "NO")
  }
  const answers = Array.isArray(values.preopAnswers) ? values.preopAnswers : []
  for (const answer of answers) {
    if (answer && typeof answer === "object" && typeof answer.stableKey === "string" && typeof answer.state === "string") {
      states.set(answer.stableKey, answer.state as PreopAnswerState)
    }
  }
  return states
}

export type PreopQuestionRow = {
  question: PreopProfileQuestion
  /** 0 for a question, 1 for a follow-up shown under its parent. */
  depth: 0 | 1
}

/**
 * The generic question rows a form section draws, in the operator's order,
 * with each follow-up placed straight after its parent and only while the
 * parent is YES. Questions with their own control are not included; the form
 * shows or hides those with isPreopQuestionShown.
 */
export function preopQuestionRows(
  profile: Pick<PreopAssessmentProfile, "questions"> | null | undefined,
  formSection: PreopFormSection,
  mode: string | null | undefined,
  states: ReadonlyMap<string, PreopAnswerState>,
): PreopQuestionRow[] {
  if (!profile) return []
  const shown = (question: PreopProfileQuestion) => question.enabled && preopQuestionAppliesToMode(question.applicability, mode)
  const ordered = [...profile.questions].sort((left, right) => left.sortOrder - right.sortOrder)
  const children = new Map<string, PreopProfileQuestion[]>()
  for (const question of ordered) {
    if (!question.parentKey) continue
    children.set(question.parentKey, [...(children.get(question.parentKey) ?? []), question])
  }
  const rows: PreopQuestionRow[] = []
  const appendFollowUps = (parentKey: string) => {
    if (states.get(parentKey) !== "YES") return
    for (const child of children.get(parentKey) ?? []) {
      if (shown(child) && !hasDedicatedPreopControl(child.stableKey)) rows.push({ question: child, depth: 1 })
    }
  }
  for (const question of ordered) {
    if (question.formSection !== formSection || question.parentKey) continue
    if (!shown(question)) continue
    if (hasDedicatedPreopControl(question.stableKey)) {
      // A baseline question with its own control can still own follow-ups
      // (A6 under unexplained complications); they render in its section.
      appendFollowUps(question.stableKey)
      continue
    }
    rows.push({ question, depth: 0 })
    appendFollowUps(question.stableKey)
  }
  return rows
}

/** Answered and total generic questions of a section, for its progress label. */
export function preopQuestionProgress(rows: readonly PreopQuestionRow[], states: ReadonlyMap<string, PreopAnswerState>) {
  const answered = rows.filter(row => {
    const state = states.get(row.question.stableKey)
    return state != null && state !== "NOT_ASKED"
  }).length
  return { answered, total: rows.length }
}

/** The questions each score is computed from. */
export const PREOP_SCORE_INPUTS: Readonly<Record<"RCRI" | "APFEL" | "STOPBANG" | "POVOC", readonly string[]>> = Object.freeze({
  RCRI: ["BASE_SURGERY_RISK", "BASE_RCRI_ISCHEMIC_HEART", "BASE_RCRI_CHF", "BASE_RCRI_CVD", "BASE_RCRI_INSULIN_DM", "BASE_RCRI_CREATININE"],
  APFEL: ["BASE_SMOKING", "BASE_APFEL_PONV_HISTORY", "BASE_APFEL_POSTOP_OPIOIDS"],
  STOPBANG: ["BASE_STOPBANG_SNORING", "BASE_STOPBANG_TIRED", "BASE_STOPBANG_OBSERVED", "BASE_STOPBANG_BP", "BASE_STOPBANG_NECK"],
  POVOC: ["BASE_POVOC_SURGERY_30_MINUTES", "BASE_POVOC_STRABISMUS_SURGERY", "BASE_POVOC_HISTORY"],
})

/**
 * Whether a score can be computed on this appliance. A score with a switched
 * off input is not available: computing it as if the missing answer were "no"
 * would understate the risk.
 */
export function isPreopScoreAvailable(
  profile: Pick<PreopAssessmentProfile, "questions"> | null | undefined,
  score: keyof typeof PREOP_SCORE_INPUTS,
): boolean {
  if (!profile) return true
  return PREOP_SCORE_INPUTS[score].every(key => profile.questions.find(item => item.stableKey === key)?.enabled !== false)
}
