import { intraopHasStarted } from "./operating-theatres"

/**
 * A cancelled procedure (10.0.0). Until the anaesthesia start is set, a case
 * whose operation will not happen can be marked cancelled instead of deleted:
 * everything recorded stays, the case is closed to editing, and it is
 * exported carrying the cancellation, so research never reads it as an
 * operation that took place. A cancellation can be undone by the same people,
 * and both are audited.
 */

export const CANCELLATION_REASONS = [
  { code: "PATIENT_CONDITION", labelEn: "The patient's condition", labelBg: "Състоянието на пациента" },
  { code: "PATIENT_REFUSED_OR_ABSENT", labelEn: "The patient refused or did not come", labelBg: "Пациентът отказа или не се яви" },
  { code: "NO_THEATRE_TIME_OR_STAFF", labelEn: "No theatre time or staff", labelBg: "Няма свободна зала или персонал" },
  { code: "EQUIPMENT_OR_BLOOD", labelEn: "Equipment or blood not available", labelBg: "Няма апаратура или кръв" },
  { code: "SURGICAL_DECISION", labelEn: "Surgical decision", labelBg: "Решение на хирурга" },
  { code: "OTHER", labelEn: "Other", labelBg: "Друго" },
] as const

export type CancellationReason = typeof CANCELLATION_REASONS[number]["code"]

export const MAX_CANCELLATION_NOTE_LENGTH = 500

export function isCancellationReason(value: unknown): value is CancellationReason {
  return typeof value === "string" && CANCELLATION_REASONS.some(reason => reason.code === value)
}

export function cancellationReasonLabel(code: string | null | undefined, language: string | null | undefined): string | null {
  const reason = CANCELLATION_REASONS.find(item => item.code === code)
  if (!reason) return null
  return language?.toLowerCase().startsWith("bg") ? reason.labelBg : reason.labelEn
}

/** A case closed to editing: finalised, or its procedure cancelled. */
export function isCaseClosed(status: string | null | undefined): boolean {
  return status === "COMPLETE" || status === "CANCELLED"
}

/** Whether a case's procedure can be marked cancelled: open, and its anaesthesia not started. */
export function cancellationAllowed(caseRecord: {
  status?: string | null
  intraop?: { startedAt?: unknown; startTime?: unknown } | null
}): boolean {
  return !isCaseClosed(caseRecord.status) && !intraopHasStarted(caseRecord.intraop)
}

export const CANCELLATION_LABEL = { en: "Procedure cancelled", bg: "Отменена процедура" } as const
