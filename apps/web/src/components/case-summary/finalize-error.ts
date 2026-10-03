import type { LABELS } from "./labels"
import { classifyFinalizationError, type FinalizationErrorKind } from "@lospor/core"

type Labels = (typeof LABELS)["en" | "bg"]

/**
 * Turn the finalization API's structured refusal into a clinician-facing
 * message. The shared classifier owns protocol interpretation; this layer
 * only supplies the web locale's wording.
 */
export function finalizeErrorMessage(body: unknown, L: Labels): string {
  const labels: Record<FinalizationErrorKind, string> = {
    missing_demographics:   L.finalizeMissingDemographics,
    missing_preop:          L.finalizeMissingPreop,
    incomplete_preop:       L.finalizeIncompletePreop,
    missing_technique:      L.finalizeMissingTechnique,
    missing_postop:         L.finalizeMissingPostop,
    missing_aldrete:        L.finalizeMissingAldrete,
    missing_disposition:    L.finalizeMissingDisposition,
    missing_intraop:        L.finalizeMissingIntraop,
    missing_start_time:     L.finalizeMissingStartTime,
    missing_end_time:       L.finalizeMissingEndTime,
    entries_after_case_end: L.finalizeEntriesAfterEnd,
    unconfirmed_stops:      L.finalizeUnconfirmedStops,
    invalid_intraop_times:  L.finalizeInvalidTimes,
    already_finalized:      L.finalizeAlreadyFinalized,
    generic:                L.finalizeFailed,
  }
  return labels[classifyFinalizationError(body)]
}
