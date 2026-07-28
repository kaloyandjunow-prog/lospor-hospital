// The one implementation of the stale-write "409 dance":
//
//   send with base timestamp → 409 → adopt the server's updatedAt →
//   retry once → keep the base ref current from whatever the server returns.
//
// Consolidates three previously separate copies (mobile intraop-event-sync,
// mobile preop-server-patch, web saveSection's missing_conflict_timestamp
// recovery). Retry policy is parameterized because the apps deliberately
// differ: mobile self-heals any 409 once (last-writer-wins by product
// decision), while the web only auto-retries the uninitialized-timestamp case
// and surfaces genuine conflicts in a resolution modal.

import { serverVersionUpdatedAt, type TimestampRef } from "./protocol"

/** Result of a single wire attempt, normalized away from fetch specifics. */
export type ConflictAttempt<T> =
  | { ok: true; body: T }
  | { ok: false; conflict: true; serverUpdatedAt: string | null; body?: unknown }
  | { ok: false; conflict: false; status?: number; body?: unknown }

/** Final outcome after up to two attempts. */
export type ConflictRetryOutcome<T> =
  | { ok: true; body: T; retried: boolean }
  | { ok: false; conflict: true; serverUpdatedAt: string | null; body?: unknown; retried: boolean }
  | { ok: false; conflict: false; status?: number; body?: unknown; retried: boolean }

export type RetryPolicy = "always" | ((conflictBody: unknown) => boolean)

/**
 * Normalize a fetch-like Response into a ConflictAttempt. Kept structural
 * (no DOM lib dependency) so core stays platform-free.
 */
export async function classifyPatchResponse<T>(res: {
  ok: boolean
  status: number
  json(): Promise<unknown>
}): Promise<ConflictAttempt<T>> {
  const body = await res.json().catch(() => ({}))
  if (res.status === 409) {
    return { ok: false, conflict: true, serverUpdatedAt: serverVersionUpdatedAt(body), body }
  }
  if (!res.ok) return { ok: false, conflict: false, status: res.status, body }
  return { ok: true, body: body as T }
}

/**
 * Run `attempt` with the current base timestamp; on a 409 that carries the
 * server's updatedAt (and passes `retryOn`), adopt it and retry exactly once.
 * `baseRef.current` is always left at the freshest timestamp we learned,
 * whether or not the save succeeded — so the *next* save starts from truth.
 */
export async function sendWithConflictRetry<T>(
  attempt: (baseUpdatedAt: string | null) => Promise<ConflictAttempt<T>>,
  baseRef: TimestampRef,
  retryOn: RetryPolicy = "always",
): Promise<ConflictRetryOutcome<T>> {
  const first = await attempt(baseRef.current)
  if (first.ok) return { ...first, retried: false }
  if (!first.conflict) return { ...first, retried: false }

  const shouldRetry = retryOn === "always" ? true : retryOn(first.body)
  if (!shouldRetry || !first.serverUpdatedAt) return { ...first, retried: false }

  baseRef.current = first.serverUpdatedAt
  const second = await attempt(first.serverUpdatedAt)
  if (second.ok) return { ...second, retried: true }
  if (second.conflict && second.serverUpdatedAt) {
    // Still conflicting — remember the newest server truth for the next save.
    baseRef.current = second.serverUpdatedAt
  }
  return { ...second, retried: true }
}

/**
 * Convenience for the common "PATCH one shape, adopt the echoed timestamp"
 * flow: runs the retry dance and, on success, moves baseRef to the timestamp
 * the server echoed back (picked out by `updatedAtOf`).
 */
export async function saveWithConflictRetry<T>(
  attempt: (baseUpdatedAt: string | null) => Promise<ConflictAttempt<T>>,
  baseRef: TimestampRef,
  updatedAtOf: (body: T) => string | null | undefined,
  retryOn: RetryPolicy = "always",
): Promise<ConflictRetryOutcome<T>> {
  const outcome = await sendWithConflictRetry(attempt, baseRef, retryOn)
  if (outcome.ok) {
    baseRef.current = updatedAtOf(outcome.body) ?? baseRef.current
  }
  return outcome
}
