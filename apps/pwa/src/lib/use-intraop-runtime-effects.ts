import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react"

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

  // What the last tick actually published, so a tick that would change nothing
  // visible can be skipped instead of re-rendering the whole intraop screen.
  const publishedMinuteRef = useRef(-1)
  const publishedProjectionRef = useRef<{ log: LogEvent[]; column: number } | null>(null)

  useEffect(() => {
    const timer = setInterval(() => {
      const start = startRef.current
      if (!start) return
      const now = new Date()

      // The header renders elapsed time to the minute (`fmtElapsed`), so five
      // of every six ticks used to set state to a value that formatted to the
      // identical string — and re-rendered the screen to display it.
      const elapsedMs = now.getTime() - start.getTime()
      const minute = Math.floor(elapsedMs / 60_000)
      if (minute !== publishedMinuteRef.current) {
        publishedMinuteRef.current = minute
        setElapsedMs(elapsedMs)
      }

      // The timetable is laid out in 5-minute columns, so re-projecting the
      // whole event log is only worth doing when the log changed or the column
      // advanced. `now` moves continuously; the rendering does not.
      const startOfGrid = roundDown5Min(start)
      const column = Math.floor((now.getTime() - startOfGrid.getTime()) / 300_000)
      const published = publishedProjectionRef.current
      if (!published || published.log !== logRef.current || published.column !== column) {
        publishedProjectionRef.current = { log: logRef.current, column }
        setTimetable(eventsToTimetable(logRef.current, startOfGrid, now))
      }
    }, 10_000)
    return () => clearInterval(timer)
  }, [logRef, setElapsedMs, setTimetable, startRef])
}
