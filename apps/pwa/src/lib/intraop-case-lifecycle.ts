import { formatHHMM } from "./intraop-format"
import { INTRAOP_RESUME_WINDOW_SECONDS } from "@lospor/core/intraop-engine"
import { intraopResumeWindow } from "@lospor/core/intraop-commands"

export const CASE_RESUME_WINDOW_SECONDS = INTRAOP_RESUME_WINDOW_SECONDS

export function buildFinaliseCaseState(
  continuedItems: string[],
  endedAt = new Date(),
): {
  continuedItems: string[] | null
  endTime: string
  endedAt: Date
  resumeSecsLeft: number
} {
  return {
    continuedItems: continuedItems.length > 0 ? continuedItems : null,
    endTime: formatHHMM(endedAt),
    endedAt,
    resumeSecsLeft: CASE_RESUME_WINDOW_SECONDS,
  }
}

/**
 * A case reopened after it ended (9.12.1). Resume stays open for what is left
 * of the window after the saved end; a case ended automatically after 48 hours
 * can always be resumed, since nobody chose to end it. The rule is Core's, the
 * same as the web's; `nowMs` is the server-corrected clock (9.13.0).
 */
export function buildReopenedEndedState(
  endedAt: Date,
  autoEnded: boolean,
  nowMs: number,
): { resumeSecsLeft: number; resumeUnlimited: boolean } {
  const window = intraopResumeWindow(endedAt, nowMs, { autoEnded })
  return { resumeSecsLeft: window.secondsLeft, resumeUnlimited: window.unlimited }
}

export function buildResumeCaseState(): {
  endTime: string
  endedAt: Date | null
  resumeSecsLeft: number
  patch: { endTime: null; endedAt: null }
} {
  return {
    endTime: "",
    endedAt: null,
    resumeSecsLeft: 0,
    patch: { endTime: null, endedAt: null },
  }
}
