import { useState, type RefObject } from "react"
import type { TimetableData, TimetableFluid } from "@/components/IntraopTimetable"
import type { FConflictAnchor, FluidConflict, PendingFluidEntry } from "@/components/intraop/timetable-types"
import { fluidDeliveredVolumeMl } from "@/lib/fluid-entry-ui"
import { serverNow } from "@/lib/intraop-clock"
import { clinicalProvenance } from "@/lib/intraop-provenance"

/**
 * Starting, re-rating and stopping fluids on the chart, and the conflict popover
 * shown when a second fluid of the same kind starts while one is still running.
 * The popover only renders and reports which button was pressed; every change to
 * the chart happens here, where the data lives.
 */
export function useFluidChartActions({ dataRef, onChangeRef, nowCol, tsForCol, uid, getFluidCategory }: {
  dataRef: RefObject<TimetableData>
  onChangeRef: RefObject<(d: TimetableData) => void>
  nowCol: number | null
  tsForCol: (col: number) => string | null
  uid: () => string
  getFluidCategory: (name: string) => string
}) {
  const [fluidConflict, setFluidConflict] = useState<FluidConflict | null>(null)

  function fluidActionTimestamp(col: number): string {
    const currentTimestamp = serverNow().toISOString()
    return nowCol != null && col === nowCol
      ? currentTimestamp
      : tsForCol(col) ?? currentTimestamp
  }

  function createFluidEntry(pending: PendingFluidEntry, col: number): TimetableFluid {
    return {
      id: `${pending.name}-${col}-${uid()}`,
      name: pending.name,
      category: pending.category,
      color: pending.color,
      startCol: col,
      endCol: col,
      startTs: fluidActionTimestamp(col),
      fluidEntryMode: pending.fluidEntryMode,
      volume: pending.volume,
      ...(pending.bagVolumeMl != null ? { bagVolumeMl: pending.bagVolumeMl } : {}),
      ...(pending.rate != null ? { rate: pending.rate, unit: pending.unit ?? "mL/h" } : {}),
      ...(pending.concentration ? { concentration: pending.concentration } : {}),
      ...(pending.suggestion ? { suggestion: pending.suggestion } : {}),
      ...clinicalProvenance(pending),
    }
  }

  function addFluidDirect(
    pending: PendingFluidEntry,
    col: number,
    updateExisting: (fluids: TimetableFluid[]) => TimetableFluid[] = fluids => fluids,
  ) {
    const fluid = createFluidEntry(pending, col)
    const d = dataRef.current
    onChangeRef.current({
      ...d,
      fluids: [...updateExisting(d.fluids ?? []), fluid],
    })
  }

  function checkFluidConflict(pending: PendingFluidEntry, col: number, anchor: FConflictAnchor): boolean {
    const cat = pending.category
    const existing = (dataRef.current.fluids ?? []).find(f =>
      (f.category ?? getFluidCategory(f.name)) === cat && f.startCol <= col && f.endCol >= col
    )
    if (!existing) return false
    setFluidConflict({
      phase: "choose",
      pending,
      newCol: col,
      existingId: existing.id,
      existingName: existing.name,
      anchor,
    })
    return true
  }

  function applyFluidRateChange(id: string, rate: number) {
    if (!Number.isFinite(rate) || rate <= 0) return
    const d = dataRef.current
    const fluid = (d.fluids ?? []).find(item => item.id === id)
    if (!fluid || fluid.fluidEntryMode !== "RATE") return
    const ts = serverNow().toISOString()
    const col = Math.max(fluid.startCol, nowCol ?? fluid.endCol)
    onChangeRef.current({
      ...d,
      fluids: (d.fluids ?? []).map(item => item.id === id ? {
        ...item,
        endCol: Math.max(item.endCol, col),
        rateChanges: [...(item.rateChanges ?? []), { col, ts, rate, unit: "mL/h" }],
      } : item),
    })
  }

  function finalizedFluid(
    fluid: TimetableFluid,
    administeredVolumeMl: number,
    endTs: string,
    endCol: number,
  ): TimetableFluid {
    const actualVolumeMl = Math.max(0, Math.round(administeredVolumeMl))
    return {
      ...fluid,
      endCol: Math.max(fluid.startCol, endCol),
      endTs,
      stopped: true,
      administeredVolumeMl: actualVolumeMl,
      volume: String(actualVolumeMl),
    }
  }

  function fluidConflictRunInParallel() {
    if (!fluidConflict) return
    addFluidDirect(fluidConflict.pending, fluidConflict.newCol)
    setFluidConflict(null)
  }

  function fluidConflictStopExisting() {
    const existing = (dataRef.current.fluids ?? []).find(fluid => fluid.id === fluidConflict?.existingId)
    // A rate line's delivered volume can be computed, so offer it rather than
    // asking a question the chart can already answer.
    if (existing?.fluidEntryMode === "RATE") {
      const endTs = fluidActionTimestamp(fluidConflict!.newCol)
      setFluidConflict(fc => fc ? {
        ...fc,
        phase: "volume",
        volInput: String(fluidDeliveredVolumeMl(existing, endTs)),
      } as FluidConflict : null)
      return
    }
    setFluidConflict(fc => fc ? { ...fc, phase: "finished" } as FluidConflict : null)
  }

  function finishExistingFluidAndStart(actualVolumeMl: number) {
    if (!fluidConflict) return
    const d = dataRef.current
    const existing = (d.fluids ?? []).find(fluid => fluid.id === fluidConflict.existingId)
    if (!existing) return
    const endTs = fluidActionTimestamp(fluidConflict.newCol)
    const endCol = Math.max(existing.startCol, fluidConflict.newCol - 1)
    const nextFluid = createFluidEntry(fluidConflict.pending, fluidConflict.newCol)
    onChangeRef.current({
      ...d,
      fluids: [
        ...(d.fluids ?? []).map(fluid => fluid.id === existing.id
          ? finalizedFluid(fluid, actualVolumeMl, endTs, endCol)
          : fluid),
        nextFluid,
      ],
    })
    setFluidConflict(null)
  }

  function fluidConflictFinishedAnswer(fullyInfused: boolean) {
    if (!fluidConflict) return
    if (fullyInfused) {
      const existing = (dataRef.current.fluids ?? []).find(fluid => fluid.id === fluidConflict.existingId)
      const fullVolume = Number(existing?.bagVolumeMl ?? existing?.volume) || 0
      finishExistingFluidAndStart(fullVolume)
      return
    }
    setFluidConflict(fc => fc ? { ...fc, phase: "volume", volInput: "" } as FluidConflict : null)
  }

  function fluidConflictConfirmVolume() {
    if (!fluidConflict || fluidConflict.phase !== "volume") return
    finishExistingFluidAndStart(Number(fluidConflict.volInput) || 0)
  }

  function stopFluid(id: string, administeredVolumeMl: number) {
    const d = dataRef.current
    const fluid = (d.fluids ?? []).find(item => item.id === id)
    if (!fluid) return
    const endTs = serverNow().toISOString()
    const endCol = Math.max(fluid.startCol, nowCol ?? fluid.endCol)
    onChangeRef.current({
      ...d,
      fluids: (d.fluids ?? []).map(item => item.id === id
        ? finalizedFluid(item, administeredVolumeMl, endTs, endCol)
        : item),
    })
  }

  return {
    fluidConflict, setFluidConflict, fluidActionTimestamp, addFluidDirect, checkFluidConflict, applyFluidRateChange, finalizedFluid,
    fluidConflictRunInParallel, fluidConflictStopExisting, fluidConflictFinishedAnswer, fluidConflictConfirmVolume, stopFluid,
  }
}
