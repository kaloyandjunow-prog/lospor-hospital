import { formatHHMM } from "./intraop-format"
import { INTRAOP_RESUME_WINDOW_SECONDS } from "@lospor/core/intraop-engine"

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
 * can always be resumed, since nobody chose to end it.
 */
export function buildReopenedEndedState(
  endedAt: Date,
  autoEnded: boolean,
  nowMs = Date.now(),
): { resumeSecsLeft: number; resumeUnlimited: boolean } {
  if (autoEnded) return { resumeSecsLeft: 0, resumeUnlimited: true }
  const elapsed = Math.floor((nowMs - endedAt.getTime()) / 1000)
  return { resumeSecsLeft: Math.max(0, CASE_RESUME_WINDOW_SECONDS - elapsed), resumeUnlimited: false }
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
