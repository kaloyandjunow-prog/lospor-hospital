/**
 * Stable, UI-independent classification of the finalization refusal returned
 * by the API.  Clients translate these keys into their own locale-specific
 * wording; the wire response itself stays owned by the API.
 */
export type FinalizationErrorKind =
  | "missing_demographics"
  | "missing_preop"
  | "incomplete_preop"
  | "missing_technique"
  | "missing_postop"
  | "missing_aldrete"
  | "missing_disposition"
  | "missing_intraop"
  | "missing_start_time"
  | "missing_end_time"
  | "invalid_intraop_times"
  | "entries_after_case_end"
  | "unconfirmed_stops"
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
 *
 * Every reason `evaluateCaseFinalization` can give has its own kind (9.13.8).
 * Four of them (no end time, no start time, chart entries after the end, an
 * unconfirmed infusion stop) used to fall through to `generic`, so the most
 * common refusal -- a case not yet ended -- told the clinician to "check all
 * required fields" and sent them looking in the wrong forms.
 */
export function classifyFinalizationError(body: unknown): FinalizationErrorKind {
  const payload: FinalizationErrorPayload =
    typeof body === "object" && body !== null ? body as FinalizationErrorPayload : {}
  const reason = typeof payload.reason === "string" ? payload.reason : null
  const code = typeof payload.code === "string" ? payload.code : null

  // The assessment exists but a required section is unfinished: not the same
  // as having no assessment at all, which is `missing_preop`.
  if (reason === "incomplete_preop") {
    return blockerHasPath(payload.blockers, "preop.demographics")
      ? "missing_demographics"
      : "incomplete_preop"
  }

  if (code === "CASE_ALREADY_FINALISED" || code === "CASE_ALREADY_FINALIZED") {
    return "already_finalized"
  }

  switch (reason) {
    case "missing_technique": return "missing_technique"
    case "missing_postop": return "missing_postop"
    case "missing_aldrete": return "missing_aldrete"
    case "missing_disposition": return "missing_disposition"
    // Not produced by the current validator; kept for older servers.
    case "missing_intraop": return "missing_intraop"
    case "missing_preop": return "missing_preop"
    case "missing_start_time": return "missing_start_time"
    case "missing_end_time": return "missing_end_time"
    case "invalid_intraop_times": return "invalid_intraop_times"
    case "entries_after_case_end": return "entries_after_case_end"
    case "unconfirmed_stops": return "unconfirmed_stops"
    default: return "generic"
  }
}
