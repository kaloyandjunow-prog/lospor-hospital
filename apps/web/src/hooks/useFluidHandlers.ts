import type { RefObject } from "react"
import type { TimetableData, TimetableFluid, IntraopLogEvent } from "@/components/IntraopTimetable"

// Same start/extend/resume/continue lifecycle as infusions, minus
// rate-changes (fluids don't have a rate) — see useInfusionHandlers.
export function useFluidHandlers(
  data: TimetableData,
  onChange: (d: TimetableData) => void,
  dataRef: RefObject<TimetableData>,
  onChangeRef: RefObject<(d: TimetableData) => void>,
  onLogEventDeleteRef: RefObject<((match: { infId?: string; fluidId?: string }) => void) | undefined>,
  emitLogEvent: (partial: Omit<IntraopLogEvent, "id" | "ts">) => void,
  nowCol: number | null,
) {
  function removeFluid(id: string) {
    onChange({ ...data, fluids: (data.fluids ?? []).filter(f => f.id !== id) })
    onLogEventDeleteRef.current?.({ fluidId: id })
  }

  function extendFluid(id: string, newEnd: number, terminate = false) {
    const d = dataRef.current; onChangeRef.current({ ...d, fluids: (d.fluids ?? []).map(f => f.id === id ? { ...f, endCol: newEnd, stopped: terminate ? true : undefined } : f) })
    if (terminate) {
      const seg = d.fluids?.find(f => f.id === id)
      if (seg) emitLogEvent({ type: "fluid_end", fluidId: id, name: seg.name, volume: seg.volume, color: seg.color })
    }
  }

  function resumeFluid(id: string) {
    const d = dataRef.current; onChangeRef.current({ ...d, fluids: (d.fluids ?? []).map(f => f.id === id ? { ...f, stopped: undefined } : f) })
  }

  function continueFluid(source: TimetableFluid, col: number) {
    const d = dataRef.current
    const newId = `${source.name}-${col}-${Date.now()}`
    const startCol = col
    const endCol   = Math.max(nowCol ?? col, col)
    onChangeRef.current({ ...d, fluids: [...(d.fluids ?? []), { ...source, id: newId, startCol, endCol, stopped: undefined }] })
  }

  return { removeFluid, extendFluid, resumeFluid, continueFluid }
}
