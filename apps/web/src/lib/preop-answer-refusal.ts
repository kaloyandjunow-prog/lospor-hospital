import type { BlockedSaveIssue } from "@lospor/core/sync"

/** Must match PREOP_ANSWER_REFUSED in apps/api/src/lib/preop/service.ts. */
export const PREOP_ANSWER_REFUSED = "PREOP_ANSWER_REFUSED"

/**
 * A preop answer the server refused, as a blocked save.
 *
 * Core's reader knows PII and the pediatric-mode refusals only. Without this
 * the outbox saw a bare 400, kept the patch, merged every later edit into it
 * and replayed it while the pill said "queued". As a blocked issue the named
 * fields are quarantined, the rest of the save goes through, and the clinician
 * is told which answer to revisit. The PWA carries the same reader.
 */
export function readPreopAnswerRefusal(value: unknown): BlockedSaveIssue | null {
  if (!value || typeof value !== "object") return null
  const body = value as Record<string, unknown>
  if (body.code !== PREOP_ANSWER_REFUSED) return null
  const reason = typeof body.reason === "string" && body.reason ? body.reason : PREOP_ANSWER_REFUSED
  const blockedKeys = Array.isArray(body.blockedKeys)
    ? body.blockedKeys.filter((key): key is string => typeof key === "string" && Boolean(key))
    : []
  const field = typeof body.field === "string" && body.field ? body.field : blockedKeys[0] ?? "preopAnswers"
  return {
    code: PREOP_ANSWER_REFUSED,
    field,
    reason,
    message: reason,
    retryable: false,
    blockedKeys: blockedKeys.length > 0 ? blockedKeys : [field],
  }
}
