import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react"

import { buildReopenedEndedState } from "@/lib/intraop-case-lifecycle"
import { serverNow } from "@/lib/server-clock"

/**
 * Counts down the seconds an ended case can still be resumed.
 *
 * On the server's clock, as the window was opened with. The count used the
 * device clock while its first value came from the server's, so a phone set
 * fast lost the difference from the window at the first tick and one set slow
 * kept Resume past 30 minutes. Nothing on the server checks the window, so
 * the phone's count is the whole of it.
 */
export function useResumeCountdown(
  caseEndedAtRef: MutableRefObject<Date | null>,
  resumeSecsLeft: number,
  setResumeSecsLeft: Dispatch<SetStateAction<number>>,
) {
  useEffect(() => {
    if (resumeSecsLeft <= 0) return
    const timer = setInterval(() => {
      if (!caseEndedAtRef.current) return
      const remaining = buildReopenedEndedState(caseEndedAtRef.current, false, serverNow().getTime()).resumeSecsLeft
      setResumeSecsLeft(remaining)
      if (remaining === 0) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [caseEndedAtRef, resumeSecsLeft, setResumeSecsLeft])
}
