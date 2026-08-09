import type { RefObject } from "react"
import type { TimetableData, TimetableFluid, IntraopLogEvent } from "@/components/IntraopTimetable"
import { calculateFluidVolumeMl, normalizeFluidEntryMode } from "@lospor/core/intraop-fluids"

// Same start/extend/resume/continue lifecycle as infusions. Exact fluid-rate
// changes are applied by the timetable UI, which owns the action timestamp.
export function useFluidHandlers(
  data: TimetableData,
  onChange: (d: TimetableData) => void,
  dataRef: RefObject<TimetableData>,
  onChangeRef: RefObject<(d: TimetableData) => void>,
  onLogEventDeleteRef: RefObject<((match: { infId?: string; fluidId?: string }) => void) | undefined>,
  emitLogEvent: (partial: Omit<IntraopLogEvent, "id" | "ts"> & { ts?: string }) => void,
  nowCol: number | null,
) {
  function removeFluid(id: string) {
    onChange({ ...data, fluids: (data.fluids ?? []).filter(f => f.id !== id) })
    onLogEventDeleteRef.current?.({ fluidId: id })
  }

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
        stopped: terminate ? true : undefined,
        ...(endTs ? { endTs } : {}),
        ...(actualVolumeMl != null
          ? { administeredVolumeMl: actualVolumeMl, volume: String(actualVolumeMl) }
          : {}),
      } : fluid),
    })
    if (terminate && segment && endTs && actualVolumeMl != null) {
      emitLogEvent({
        type: "fluid_end",
        ts: endTs,
        fluidId: id,
        name: segment.name,
        category: segment.category,
        fluidEntryMode: normalizeFluidEntryMode(segment.fluidEntryMode),
        administeredVolumeMl: actualVolumeMl,
        volume: String(actualVolumeMl),
        color: segment.color,
        clinicalRuleKey: segment.clinicalRuleKey,
        clinicalRuleVersion: segment.clinicalRuleVersion,
        clinicalRuleSourceIds: segment.clinicalRuleSourceIds,
        clinicalPresetId: segment.clinicalPresetId,
        clinicalPresetVersion: segment.clinicalPresetVersion,
        clinicalPresetScope: segment.clinicalPresetScope,
      })
    }
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
    emitLogEvent({
      type: "fluid_start",
      ts: startTs,
      fluidId: next.id,
      name: next.name,
      category: next.category,
      color: next.color,
      fluidEntryMode,
      volume: next.volume,
      bagVolumeMl: next.bagVolumeMl,
      rate: next.rate == null ? undefined : String(next.rate),
      unit: next.unit,
      concentration: next.concentration,
      clinicalRuleKey: next.clinicalRuleKey,
      clinicalRuleVersion: next.clinicalRuleVersion,
      clinicalRuleSourceIds: next.clinicalRuleSourceIds,
      clinicalPresetId: next.clinicalPresetId,
      clinicalPresetVersion: next.clinicalPresetVersion,
      clinicalPresetScope: next.clinicalPresetScope,
    })
  }

  return { removeFluid, extendFluid, resumeFluid, continueFluid }
}
