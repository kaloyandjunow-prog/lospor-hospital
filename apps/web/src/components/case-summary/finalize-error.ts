import type { LABELS } from "./labels"

type Labels = (typeof LABELS)["en" | "bg"]

type FinalizeErrorBody = {
  reason?: unknown
  blockers?: unknown
}

function hasBlockerPath(blockers: unknown, expectedPath: string): boolean {
  if (!Array.isArray(blockers)) return false
  return blockers.some(blocker => {
    if (typeof blocker !== "object" || blocker === null) return false
    const path = (blocker as { path?: unknown }).path
    return Array.isArray(path) && path.some(part => part === expectedPath)
  })
}

/**
 * Turn the finalization API's structured refusal into a clinician-facing
 * message. `incomplete_preop` is a family of section blockers, so its path is
 * what tells the user which part of the assessment still needs attention.
 */
export function finalizeErrorMessage(body: unknown, L: Labels): string {
  const payload: FinalizeErrorBody =
    typeof body === "object" && body !== null ? body as FinalizeErrorBody : {}
  const reason = payload.reason

  if (reason === "incomplete_preop") {
    return hasBlockerPath(payload.blockers, "preop.demographics")
      ? L.finalizeMissingDemographics
      : L.finalizeMissingPreop
  }

  const reasonLabels: Record<string, string> = {
    missing_technique:      L.finalizeMissingTechnique,
    missing_postop:         L.finalizeMissingPostop,
    missing_aldrete:        L.finalizeMissingAldrete,
    missing_disposition:    L.finalizeMissingDisposition,
    missing_intraop:        L.finalizeMissingIntraop,
    missing_preop:          L.finalizeMissingPreop,
    invalid_intraop_times:  L.finalizeInvalidTimes,
  }

  return typeof reason === "string"
    ? (reasonLabels[reason] ?? reason)
    : L.finalizeFailed
}
