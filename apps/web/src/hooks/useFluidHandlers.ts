import type { RefObject } from "react"
import type { TimetableData, TimetableFluid } from "@/components/IntraopTimetable"
import { calculateFluidVolumeMl, normalizeFluidEntryMode } from "@lospor/core/intraop-fluids"

// Same start/extend/resume/continue lifecycle as infusions. Exact fluid-rate
// changes are applied by the timetable UI, which owns the action timestamp.
export function useFluidHandlers(
  data: TimetableData,
  onChange: (d: TimetableData) => void,
  dataRef: RefObject<TimetableData>,
  onChangeRef: RefObject<(d: TimetableData) => void>,
  nowCol: number | null,
) {
  function removeFluid(id: string) {
    onChange({ ...data, fluids: (data.fluids ?? []).filter(f => f.id !== id) })
  }

  // 1.4.9: a bar's end is its stop. Dropping the end grip stops it at that
  // column (a planned stop if the column is still ahead); on a stopped bar it
  // moves the stop. A running bar otherwise ends at "now" by itself.
  function extendFluid(id: string, newEnd: number, terminate = false) {
    const d = dataRef.current
    const segment = d.fluids?.find(fluid => fluid.id === id)
    const endTs = terminate ? new Date().toISOString() : undefined
    const actualVolumeMl = segment && endTs
      ? calculateFluidVolumeMl({
          fluidEntryMode: segment.fluidEntryMode,
          bagVolumeMl: segment.bagVolumeMl,
          administeredVolumeMl: segment.administeredVolumeMl,
          legacyVolume: segment.volume,
          startTs: segment.startTs,
          endTs,
          rate: segment.rate,
          rateChanges: segment.rateChanges,
        })
      : null
    onChangeRef.current({
      ...d,
      fluids: (d.fluids ?? []).map(fluid => fluid.id === id ? {
        ...fluid,
        endCol: newEnd,
        plannedStopCol: undefined,
        stopped: true,
        ...(endTs ? { endTs } : {}),
        ...(actualVolumeMl != null
          ? { administeredVolumeMl: actualVolumeMl, volume: String(actualVolumeMl) }
          : {}),
      } : fluid),
    })
  }

  function resumeFluid(id: string) {
    const d = dataRef.current
    const source = (d.fluids ?? []).find(fluid => fluid.id === id)
    if (source?.fluidEntryMode === "RATE") {
      continueFluid(source, Math.max(nowCol ?? source.endCol + 1, source.endCol + 1))
      return
    }
    onChangeRef.current({
      ...d,
      fluids: (d.fluids ?? []).map(fluid => fluid.id === id
        ? { ...fluid, stopped: undefined, endTs: undefined }
        : fluid),
    })
  }

  function continueFluid(source: TimetableFluid, col: number) {
    const d = dataRef.current
    const newId = `${source.name}-${col}-${Date.now()}`
    const startCol = col
    const endCol   = Math.max(nowCol ?? col, col)
    const fluidEntryMode = normalizeFluidEntryMode(source.fluidEntryMode)
    const startTs = new Date().toISOString()
    const latestRateChange = [...(source.rateChanges ?? [])]
      .sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts))
      .at(-1)
    const next: TimetableFluid = {
      ...source,
      id: newId,
      startCol,
      endCol,
      startTs,
      endTs: undefined,
      stopped: undefined,
      administeredVolumeMl: undefined,
      volume: fluidEntryMode === "RATE"
        ? "0"
        : String(source.bagVolumeMl ?? source.volume),
      rateChanges: fluidEntryMode === "RATE" ? [] : undefined,
      rate: fluidEntryMode === "RATE" ? latestRateChange?.rate ?? source.rate : source.rate,
    }
    onChangeRef.current({ ...d, fluids: [...(d.fluids ?? []), next] })
  }

  return { removeFluid, extendFluid, resumeFluid, continueFluid }
}
