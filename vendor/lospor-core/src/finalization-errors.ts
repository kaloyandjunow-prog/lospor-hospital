/**
 * Stable, UI-independent classification of the finalization refusal returned
 * by the API.  Clients translate these keys into their own locale-specific
 * wording; the wire response itself stays owned by the API.
 */
export type FinalizationErrorKind =
  | "missing_demographics"
  | "missing_preop"
  | "missing_technique"
  | "missing_postop"
  | "missing_aldrete"
  | "missing_disposition"
  | "missing_intraop"
  | "invalid_intraop_times"
  | "already_finalized"
  | "generic"

type FinalizationErrorPayload = {
  reason?: unknown
  code?: unknown
  blockers?: unknown
}

function blockerHasPath(blockers: unknown, expectedPath: string): boolean {
  if (!Array.isArray(blockers)) return false
  return blockers.some(blocker => {
    if (typeof blocker !== "object" || blocker === null) return false
    const path = (blocker as { path?: unknown }).path
    return Array.isArray(path) && path.some(part => part === expectedPath)
  })
}

/**
 * Classify a finalization refusal without exposing protocol codes or raw
 * server text to a clinician. Unknown responses deliberately become
 * `generic`, so adding a new server reason cannot create an accidental UI
 * leak or an unlocalized message.
 */
export function classifyFinalizationError(body: unknown): FinalizationErrorKind {
  const payload: FinalizationErrorPayload =
    typeof body === "object" && body !== null ? body as FinalizationErrorPayload : {}
  const reason = typeof payload.reason === "string" ? payload.reason : null
  const code = typeof payload.code === "string" ? payload.code : null

  if (reason === "incomplete_preop") {
    return blockerHasPath(payload.blockers, "preop.demographics")
      ? "missing_demographics"
      : "missing_preop"
  }

  if (code === "CASE_ALREADY_FINALISED" || code === "CASE_ALREADY_FINALIZED") {
    return "already_finalized"
  }

  switch (reason) {
    case "missing_technique": return "missing_technique"
    case "missing_postop": return "missing_postop"
    case "missing_aldrete": return "missing_aldrete"
    case "missing_disposition": return "missing_disposition"
    case "missing_intraop": return "missing_intraop"
    case "missing_preop": return "missing_preop"
    case "invalid_intraop_times": return "invalid_intraop_times"
    default: return "generic"
  }
}
