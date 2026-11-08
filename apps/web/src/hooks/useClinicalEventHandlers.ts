import type { RefObject } from "react"
import type { TimetableData } from "@/components/IntraopTimetable"

export function useClinicalEventHandlers(
  dataRef: RefObject<TimetableData>,
  onChangeRef: RefObject<(d: TimetableData) => void>,
) {
  function addClinicalEvent(colIdx: number, label: string, color: string, isComplication: boolean, suggestion?: string) {
    // A complication is one timed entry (10.1.0): drawn here, saved as a
    // complication event, and listed in the complications and the event log
    // from that same entry. Before 10.1.0 it went to the list only.
    const d = dataRef.current
    const marker = isComplication
      ? { colIdx, label, color: "#ef4444", kind: "complication" as const }
      : { colIdx, label, color, ...(suggestion ? { suggestion } : {}) }
    onChangeRef.current({ ...d, clinicalEvents: [...(d.clinicalEvents ?? []), marker] })
  }
  /** A shock at a column (10.1.0), saved as a defibrillation event. */
  function addDefibrillation(colIdx: number, energyJ: number, synchronized: boolean, suggestion?: string) {
    const d = dataRef.current
    const label = synchronized ? "Cardioversion" : "Defibrillation"
    onChangeRef.current({ ...d, clinicalEvents: [...(d.clinicalEvents ?? []), { colIdx, label, color: "#f59e0b", kind: "defibrillation" as const, energyJ, synchronized, ...(suggestion ? { suggestion } : {}) }] })
  }
  function removeClinicalEvent(colIdx: number, label: string) {
    const d = dataRef.current
    onChangeRef.current({ ...d, clinicalEvents: (d.clinicalEvents ?? []).filter(e => !(e.colIdx === colIdx && e.label === label)) })
  }

  return { addClinicalEvent, removeClinicalEvent, addDefibrillation }
}
