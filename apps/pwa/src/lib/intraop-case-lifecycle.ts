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
