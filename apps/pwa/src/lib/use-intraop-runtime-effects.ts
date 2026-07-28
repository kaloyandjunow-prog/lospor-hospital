import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react"

import type { TimetableData } from "@/components/IntraopTimetable"
import { eventsToTimetable, roundDown5Min } from "@/lib/intraop-projection"
import type { LogEvent } from "@/lib/intraop-log-event"

type UseIntraopRuntimeEffectsArgs = {
  log: LogEvent[]
  logRef: MutableRefObject<LogEvent[]>
  startRef: MutableRefObject<Date | null>
  setElapsedMs: Dispatch<SetStateAction<number>>
  setTimetable: Dispatch<SetStateAction<TimetableData>>
}

export function useIntraopRuntimeEffects({
  log,
  logRef,
  startRef,
  setElapsedMs,
  setTimetable,
}: UseIntraopRuntimeEffectsArgs) {
  // Fluid totals used to be recomputed here and PATCHed to the server on every
  // fluid change — a second write on top of the fluid event itself, which
  // always lost a conflict race and retried (the "multiple autosave rolls").
  // The server now derives fluid totals from the fluid events in
  // rebuildProjection, so the client no longer writes them at all.
  useEffect(() => {
    logRef.current = log
  }, [log, logRef])

  useEffect(() => {
    const timer = setInterval(() => {
      if (!startRef.current) return
      const now = new Date()
      setElapsedMs(now.getTime() - startRef.current.getTime())
      setTimetable(eventsToTimetable(logRef.current, roundDown5Min(startRef.current), now))
    }, 10_000)
    return () => clearInterval(timer)
  }, [logRef, setElapsedMs, setTimetable, startRef])
}
