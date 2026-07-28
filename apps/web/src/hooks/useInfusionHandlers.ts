import type { RefObject } from "react"
import type { TimetableData, TimetableInfusion, IntraopLogEvent } from "@/components/IntraopTimetable"

// Infusions have the heaviest lifecycle of any domain in this file: start →
// rate-change (any number of times) → extend/retract either edge → stop →
// resume → continue-as-new-segment. All seven pieces of that lifecycle live
// here together since they all mutate the same `infusions` array shape and
// most share the rateChanges-aware logic.
export function useInfusionHandlers(
  data: TimetableData,
  onChange: (d: TimetableData) => void,
  dataRef: RefObject<TimetableData>,
  onChangeRef: RefObject<(d: TimetableData) => void>,
  onLogEventDeleteRef: RefObject<((match: { infId?: string; fluidId?: string }) => void) | undefined>,
  emitLogEvent: (partial: Omit<IntraopLogEvent, "id" | "ts">) => void,
  nowCol: number | null,
) {
  function removeInfusion(id: string) {
    onChange({ ...data, infusions: (data.infusions ?? []).filter(i => i.id !== id) })
    onLogEventDeleteRef.current?.({ infId: id })
  }

  function extendInfusion(id: string, newEnd: number, terminate = false) {
    const d = dataRef.current; onChangeRef.current({ ...d, infusions: (d.infusions ?? []).map(i => i.id === id ? { ...i, endCol: newEnd, stopped: terminate ? true : undefined } : i) })
    if (terminate) {
      const seg = d.infusions?.find(i => i.id === id)
      if (seg) emitLogEvent({ type: "infusion_stop", infId: id, name: seg.name, color: seg.color })
    }
  }

  function resumeInfusion(id: string) {
    const d = dataRef.current; onChangeRef.current({ ...d, infusions: (d.infusions ?? []).map(i => i.id === id ? { ...i, stopped: undefined } : i) })
  }

  function continueInfusion(source: TimetableInfusion, col: number) {
    const d = dataRef.current
    const newId = `${source.name}-${col}-${Date.now()}`
    const startCol = col
    const endCol   = Math.max(nowCol ?? col, col)  // past cell → fill to now; future cell → start there
    onChangeRef.current({ ...d, infusions: [...(d.infusions ?? []), { ...source, id: newId, startCol, endCol, stopped: undefined }] })
  }

  function extendInfusionLeft(id: string, newStartCol: number) {
    const d = dataRef.current
    const seg = (d.infusions ?? []).find(i => i.id === id)
    if (!seg) return
    const clamped = Math.max(0, Math.min(newStartCol, seg.endCol))
    onChangeRef.current({ ...d, infusions: (d.infusions ?? []).map(i => i.id === id ? {
      ...i, startCol: clamped,
      rateChanges: (i.rateChanges ?? []).filter(rc => rc.col >= clamped),
    } : i) })
  }

  function restoreInfusion(id: string) {
    const d = dataRef.current
    const col = nowCol !== null ? nowCol : 0
    onChangeRef.current({ ...d, infusions: (d.infusions ?? []).map(i => i.id === id ? { ...i, stopped: undefined, endCol: Math.max(i.endCol, col) } : i) })
  }

  function applyInfRateChange(infId: string, fromCol: number | null, toCol: number, rate: number, unit: string, concentration?: string) {
    const seg = (dataRef.current.infusions ?? []).find(i => i.id === infId)
    onChangeRef.current({
      ...dataRef.current,
      infusions: (dataRef.current.infusions ?? []).map(i => {
        if (i.id !== infId) return i
        const changes = (i.rateChanges ?? []).filter(rc => rc.col !== fromCol && rc.col !== toCol).sort((a, b) => a.col - b.col)
        if (toCol === i.startCol) {
          // Dropped on the start cell → change the base rate/concentration of the segment
          return { ...i, rate, unit, concentration: concentration ?? i.concentration, rateChanges: changes.length > 0 ? changes : undefined }
        }
        return { ...i, rateChanges: [...changes, { col: toCol, rate, unit, concentration: concentration ?? i.concentration }].sort((a, b) => a.col - b.col) }
      }),
    })
    if (seg) emitLogEvent({ type: "infusion_rate", infId, name: seg.name, rate: String(rate), unit })
  }

  return { removeInfusion, extendInfusion, resumeInfusion, continueInfusion, extendInfusionLeft, restoreInfusion, applyInfRateChange }
}
