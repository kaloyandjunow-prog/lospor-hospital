import { classifyFinalizationError, type FinalizationErrorKind } from "@lospor/core"
import type { ClinicalStringKey } from "@/lib/preferences-context"

const FINALIZATION_MESSAGE_KEYS: Record<FinalizationErrorKind, ClinicalStringKey> = {
  missing_demographics: "finalizeMissingDemographics",
  missing_preop: "finalizeMissingPreop",
  incomplete_preop: "finalizeIncompletePreop",
  missing_start_time: "finalizeMissingStartTime",
  missing_end_time: "finalizeMissingEndTime",
  entries_after_case_end: "finalizeEntriesAfterEnd",
  unconfirmed_stops: "finalizeUnconfirmedStops",
  missing_technique: "finalizeMissingTechnique",
  missing_postop: "finalizeMissingPostop",
  missing_aldrete: "finalizeMissingAldrete",
  missing_disposition: "finalizeMissingDisposition",
  missing_intraop: "finalizeMissingIntraop",
  invalid_intraop_times: "finalizeInvalidTimes",
  already_finalized: "finalizeAlreadyFinalized",
  generic: "couldFinaliseCase",
}

/** Turn the shared finalization protocol result into a localized PWA key. */
export function finalizationErrorMessage(
  body: unknown,
  tc: (key: ClinicalStringKey) => string,
): string {
  return tc(FINALIZATION_MESSAGE_KEYS[classifyFinalizationError(body)])
}
