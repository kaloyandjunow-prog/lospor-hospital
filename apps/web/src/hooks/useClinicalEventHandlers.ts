import type { RefObject } from "react"
import type { TimetableData, IntraopLogEvent } from "@/components/IntraopTimetable"

export function useClinicalEventHandlers(
  dataRef: RefObject<TimetableData>,
  onChangeRef: RefObject<(d: TimetableData) => void>,
  emitLogEvent: (partial: Omit<IntraopLogEvent, "id" | "ts">) => void,
  onComplicationAdded?: (labels: string[]) => void,
) {
  function addClinicalEvent(colIdx: number, label: string, color: string, isComplication: boolean) {
    // A complication picked from the quick-pill list is a complication, not
    // a timeline milestone -- it belongs in the case's complications list
    // only. Emitting a clinical_event here too used to record the same
    // finding twice, in two tables with no link between them.
    if (isComplication) {
      onComplicationAdded?.([label])
      return
    }
    const d = dataRef.current
    onChangeRef.current({ ...d, clinicalEvents: [...(d.clinicalEvents ?? []), { colIdx, label, color }] })
    emitLogEvent({ type: "clinical_event", label, color })
  }
  function removeClinicalEvent(colIdx: number, label: string) {
    const d = dataRef.current
    onChangeRef.current({ ...d, clinicalEvents: (d.clinicalEvents ?? []).filter(e => !(e.colIdx === colIdx && e.label === label)) })
  }

  return { addClinicalEvent, removeClinicalEvent }
}
