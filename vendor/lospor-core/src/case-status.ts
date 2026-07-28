export type PersistedCaseStatus =
  | "DRAFT"
  | "IN_PROGRESS"
  | "AWAITING_REVIEW"
  | "COMPLETE"

export type DerivedCaseStage =
  | "DRAFT"
  | "IN_CONSULTATION"
  | "AWAITING_ALLOCATION"
  | "IN_PROGRESS"
  | "AWAITING_POSTOP"
  | "AWAITING_REVIEW"
  | "COMPLETE"

// Backwards-compatible name for existing badges. Persistence code should use
// PersistedCaseStatus so derived display stages cannot reach the Prisma enum.
export type CaseStatus = DerivedCaseStage

export const CASE_STATUS_LABELS: Record<DerivedCaseStage, { en: string; bg: string }> = {
  DRAFT:               { en: "Draft",               bg: "Чернова" },
  IN_CONSULTATION:     { en: "In consultation",     bg: "На консултация" },
  AWAITING_ALLOCATION: { en: "Awaiting allocation", bg: "Изчаква разпределение" },
  IN_PROGRESS:         { en: "In theatre",          bg: "В операционна" },
  AWAITING_POSTOP:     { en: "Awaiting postop",     bg: "Изчаква постоперативен преглед" },
  AWAITING_REVIEW:     { en: "Awaiting review",     bg: "Изчаква преглед" },
  COMPLETE:            { en: "Case finished",       bg: "Случаят е завършен" },
}

export type CaseStageInput = {
  status?: PersistedCaseStatus | string | null
  preop?: {
    diagnosis?: string | null
    plannedProcedure?: string | null
    asaScore?: string | null
  } | null
  intraop?: {
    endTime?: unknown
  } | null
}

export function deriveCaseStage(input: CaseStageInput): DerivedCaseStage {
  if (input.status === "COMPLETE") return "COMPLETE"
  if (input.status === "AWAITING_REVIEW") return "AWAITING_REVIEW"
  if (input.intraop?.endTime != null) return "AWAITING_POSTOP"
  if (input.status === "IN_PROGRESS") return "IN_PROGRESS"
  const preopComplete = Boolean(
    input.preop?.diagnosis
    && input.preop.plannedProcedure
    && input.preop.asaScore,
  )
  if (preopComplete) return "AWAITING_ALLOCATION"
  if (input.preop?.diagnosis) return "IN_CONSULTATION"
  return "DRAFT"
}
