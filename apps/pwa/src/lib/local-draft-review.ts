import type { BlockedSaveIssue, RejectedField } from "@lospor/core/sync"
import type { LocalCaseDraft, LocalCaseDraftSyncReview } from "./local-case-store"

const SAFE_FIELD_PATH = /^[A-Za-z][A-Za-z0-9_.\[\]-]{0,127}$/
const BLOCKED_REASONS = new Set([
  "likely_name",
  "egn",
  "long_number",
  "date",
  "email",
] as const)

type SafeBlockedReason = NonNullable<LocalCaseDraftSyncReview["blocked"]>["reason"]

function safeFieldPath(value: unknown): string | null {
  if (typeof value !== "string") return null
  const path = value.trim()
  return SAFE_FIELD_PATH.test(path) ? path : null
}

function safeBlockedReason(value: string): SafeBlockedReason {
  return BLOCKED_REASONS.has(value as Exclude<SafeBlockedReason, "other">)
    ? value as "likely_name" | "egn" | "long_number" | "date" | "email"
    : "other"
}

/**
 * Reduce server feedback to the non-clinical metadata that the recovery UI is
 * allowed to show. Values and server error prose are intentionally excluded.
 */
export function localDraftSyncReview(
  blocked?: Pick<BlockedSaveIssue, "field" | "reason">,
  rejectedFields: readonly Pick<RejectedField, "path">[] = [],
): LocalCaseDraftSyncReview | undefined {
  // A malformed server path must not turn a partial acceptance into apparent
  // success. Fall back to a generic, non-clinical path while discarding the
  // unsafe text itself.
  const blockedField = blocked ? (safeFieldPath(blocked.field) ?? "preop") : null
  const safeRejected = [...new Set(
    rejectedFields
      .map(field => safeFieldPath(field.path))
      .filter((path): path is string => path !== null),
  )]
  const rejected = safeRejected.length > 0
    ? safeRejected
    : rejectedFields.length > 0
      ? ["preop"]
      : []
  if (!blockedField && rejected.length === 0) return undefined
  return {
    ...(blockedField && blocked
      ? { blocked: { field: blockedField, reason: safeBlockedReason(blocked.reason) } }
      : {}),
    ...(rejected.length > 0 ? { rejectedFields: rejected } : {}),
  }
}

export function reviewFieldNames(review: LocalCaseDraftSyncReview): string[] {
  const paths = [
    ...(review.blocked ? [review.blocked.field] : []),
    ...(review.rejectedFields ?? []),
  ]
  return [...new Set(paths.map(path => path.split(".").pop() ?? path))]
}

export function shouldShowLocalDraft(
  draft: Pick<LocalCaseDraft, "serverCaseId" | "syncReview">,
): boolean {
  return !draft.serverCaseId || Boolean(draft.syncReview)
}

export function localDraftRecoveryParams(
  draft: Pick<LocalCaseDraft, "localId" | "serverCaseId">,
): { localId: string; continue?: string } {
  return draft.serverCaseId
    ? { continue: draft.serverCaseId, localId: draft.localId }
    : { localId: draft.localId }
}

function reviewFieldLabel(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
}

function reviewReasonLabel(reason: SafeBlockedReason, language: string): string {
  const labels: Record<SafeBlockedReason, [string, string]> = {
    likely_name: ["possible name", "възможно име"],
    egn: ["national identifier", "ЕГН"],
    long_number: ["identifying number", "идентифициращ номер"],
    date: ["identifying date", "идентифицираща дата"],
    email: ["email address", "имейл адрес"],
    other: ["identifying information", "идентифицираща информация"],
  }
  const label = labels[reason] ?? labels.other
  return language === "bg" ? label[1] : label[0]
}

/** Safe, clinician-facing summary: field names and categories, never values. */
export function localDraftReviewSummary(
  review: LocalCaseDraftSyncReview,
  language: string,
): string {
  const fields = reviewFieldNames(review).map(reviewFieldLabel).join(", ")
  const reasons = [
    ...(review.blocked ? [reviewReasonLabel(review.blocked.reason, language)] : []),
    ...((review.rejectedFields?.length ?? 0) > 0
      ? [language === "bg" ? "невалидна стойност" : "invalid value"]
      : []),
  ]
  return language === "bg"
    ? `Проверете: ${fields} · Причина: ${reasons.join(", ")}`
    : `Check: ${fields} · Reason: ${reasons.join(", ")}`
}

/** Rebuild only the structural shape needed by the translated form warning. */
export function reviewBlockedIssue(
  review: LocalCaseDraftSyncReview,
): BlockedSaveIssue | null {
  if (!review.blocked) return null
  const field = review.blocked.field
  return {
    code: "PII_BLOCKED",
    field,
    reason: review.blocked.reason,
    message: "This field needs review before it can be saved.",
    retryable: false,
    blockedKeys: [field.split(".").pop() ?? field],
  }
}
