import type { RefObject } from "react"
import type { TimetableData, IntraopLogEvent } from "@/components/IntraopTimetable"

export function useClinicalEventHandlers(
  dataRef: RefObject<TimetableData>,
  onChangeRef: RefObject<(d: TimetableData) => void>,
  emitLogEvent: (partial: Omit<IntraopLogEvent, "id" | "ts">) => void,
  onComplicationAdded?: (labels: string[]) => void,
) {
  function addClinicalEvent(colIdx: number, label: string, color: string, isComplication: boolean) {
    const d = dataRef.current
    onChangeRef.current({ ...d, clinicalEvents: [...(d.clinicalEvents ?? []), { colIdx, label, color }] })
    emitLogEvent({ type: "clinical_event", label, color })
    if (isComplication) onComplicationAdded?.([label])
  }
  function removeClinicalEvent(colIdx: number, label: string) {
    const d = dataRef.current
    onChangeRef.current({ ...d, clinicalEvents: (d.clinicalEvents ?? []).filter(e => !(e.colIdx === colIdx && e.label === label)) })
  }

  return { addClinicalEvent, removeClinicalEvent }
}
