import type { MutableRefObject } from "react"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { TimetableData } from "@/components/IntraopTimetable"

/** What the End case check reads from the screen: the record as it stands right now, in the shape Core's readiness rules expect. */
export function intraopReadinessInput(state: {
  startRef: MutableRefObject<Date | null>
  caseStartTime: string
  techniques: string[]
  awDevices: string[]
  awVentModes: string[]
  positions: string[]
  vascularAccesses: unknown[]
  monitoring: string[]
  timetable: TimetableData
  log: LogEvent[]
  selectedComplications: string[]
  complicationsNotes: string
}) {
  return {
    startedAt: state.startRef.current?.toISOString(),
    startTime: state.caseStartTime,
    techniques: state.techniques,
    airwayDevices: state.awDevices,
    ventilationModes: state.awVentModes,
    positions: state.positions,
    vascularAccesses: state.vascularAccesses,
    ...Object.fromEntries(state.monitoring.map(field => [field, true])),
    timetableData: state.timetable,
    keyEvents: state.log,
    complications: state.selectedComplications.length > 0 || state.complicationsNotes.trim()
      ? state.selectedComplications.join(", ") || state.complicationsNotes
      : "",
  }
}
