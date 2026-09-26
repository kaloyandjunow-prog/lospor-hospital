import { useCallback, useRef, useState, type MutableRefObject } from "react"

import type { TimetableData } from "@/components/IntraopTimetable"
import { rebuildActiveState, type ActiveAgent } from "@/lib/intraop-active-state"
import type { ActiveFluid, ActiveGasSettings, ActiveInfusion, LogEvent } from "@/lib/intraop-log-event"
import { eventsToTimetable } from "@/lib/intraop-projection"

export type RunningAgent = NonNullable<ActiveAgent>

/**
 * What is running on the intraop chart, owned in one place (1.4.9).
 *
 * - Several volatile agents may run at once, so agents are a list; `activeAgent`
 *   is the most recently started one, for displays that show a single agent.
 * - `resyncActiveRef` rebuilds everything from the saved log. The entry sheets
 *   update running items optimistically; when the timeline rules refuse an
 *   entry, this puts them back to what the log says.
 * - `endedAtRef` is the case end once the case has ended: the chart is then
 *   read at the end, so items continued postoperatively stop growing and every
 *   total is capped there. `projectTimetable` applies it.
 */
export function useIntraopRunningState(logRef: MutableRefObject<LogEvent[]>) {
  const [activeInfusions, setActiveInfusions] = useState<ActiveInfusion[]>([])
  const [activeFluids, setActiveFluids] = useState<ActiveFluid[]>([])
  const [activeAgents, setActiveAgents] = useState<RunningAgent[]>([])
  const [activeGas, setActiveGas] = useState<ActiveGasSettings>(null)
  const endedAtRef = useRef<Date | null>(null)

  const applyActiveState = useCallback((active: ReturnType<typeof rebuildActiveState>) => {
    setActiveInfusions(active.infusions)
    setActiveFluids(active.fluids)
    setActiveAgents(active.agents)
    setActiveGas(active.gas)
  }, [])

  const resyncActiveRef = useRef<() => void>(() => {})
  resyncActiveRef.current = () => {
    applyActiveState(rebuildActiveState(logRef.current, endedAtRef.current ?? new Date()))
  }

  const projectTimetable = useCallback((log: LogEvent[], startTs: Date, now?: Date): TimetableData =>
    eventsToTimetable(log, startTs, now, endedAtRef.current), [])

  return {
    activeInfusions, setActiveInfusions,
    activeFluids, setActiveFluids,
    activeAgents, setActiveAgents,
    activeAgent: activeAgents[activeAgents.length - 1] ?? null,
    activeGas, setActiveGas,
    applyActiveState,
    resyncActiveRef,
    endedAtRef,
    projectTimetable,
  }
}
