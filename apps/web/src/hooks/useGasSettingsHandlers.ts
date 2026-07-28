import { useState } from "react"
import type { RefObject } from "react"
import type { TimetableData, GasSettingsSegment, IntraopLogEvent } from "@/components/IntraopTimetable"
import { gasSettingsAtColumn } from "@lospor/core/intraop-summary"

// FGF/carrier-gas/FiO2 lifecycle: manual start → change (any number of times,
// tracked like infusion rate-changes since FiO2 in particular is titrated
// continuously) → stop (with confirmation, mirroring the agent discontinue
// pattern). Only one gas-settings segment runs at a time, unlike infusions.
export function useGasSettingsHandlers(
  data: TimetableData,
  onChange: (d: TimetableData) => void,
  dataRef: RefObject<TimetableData>,
  onChangeRef: RefObject<(d: TimetableData) => void>,
  emitLogEvent: (partial: Omit<IntraopLogEvent, "id" | "ts"> & { ts?: string }) => void,
  timestampForColumn: (column: number) => string | null,
) {
  const gasSettings = data.gasSettings ?? []

  const [gasPicker, setGasPicker]         = useState<number | null>(null)
  const [gasPickerRect, setGasPickerRect] = useState<DOMRect | null>(null)
  const [pickerFgf, setPickerFgf]         = useState<number>(2)
  const [pickerCarrierGas, setPickerCarrierGas] = useState<string | null>(null)
  const [pickerFio2, setPickerFio2]       = useState<number>(100)

  function normalizeGasSettings(fgf: number, carrierGas: string | null, fio2: number) {
    const safeFio2 = carrierGas == null ? 100 : Math.min(100, Math.max(21, fio2))
    return {
      fgf,
      carrierGas,
      fio2: safeFio2,
      fiAir: carrierGas === "air" ? 100 - safeFio2 : 0,
      fiN2O: carrierGas === "n2o" ? 100 - safeFio2 : 0,
    }
  }

  function closeGasPicker() { setGasPicker(null); setGasPickerRect(null) }

  function openPickerForSeg(ci: number, seg: GasSettingsSegment, rect: DOMRect) {
    if (gasPicker === ci) { closeGasPicker(); return }
    const settings = gasSettingsAtColumn(seg, ci)
    if (!settings) return
    setPickerFgf(settings.fgf)
    setPickerCarrierGas(settings.carrierGas)
    setPickerFio2(settings.fio2)
    setGasPicker(ci); setGasPickerRect(rect)
  }

  function openPickerEmpty(ci: number, rect: DOMRect) {
    if (gasPicker === ci) { closeGasPicker(); return }
    setPickerFgf(2); setPickerCarrierGas(null); setPickerFio2(100)
    setGasPicker(ci); setGasPickerRect(rect)
  }

  function startGas(col: number) {
    const id = `gas-${col}-${Date.now()}`
    const settings = normalizeGasSettings(pickerFgf, pickerCarrierGas, pickerFio2)
    onChange({ ...data, gasSettings: [...gasSettings.filter(g => g.stopped || g.endCol < col), { id, startCol: col, endCol: col, ...settings }] })
    emitLogEvent({ type: "gas_start", ...settings, ts: timestampForColumn(col) ?? undefined })
    closeGasPicker()
  }

  function applyGasChange(segId: string) {
    const seg = gasSettings.find(g => g.id === segId)
    if (!seg) { closeGasPicker(); return }
    const settings = normalizeGasSettings(pickerFgf, pickerCarrierGas, pickerFio2)
    const col = gasPicker ?? seg.startCol
    onChangeRef.current({
      ...dataRef.current,
      gasSettings: (dataRef.current.gasSettings ?? []).map(g => {
        if (g.id !== segId) return g
        if (col === g.startCol) return { ...g, ...settings }
        const changes = (g.settingsChanges ?? []).filter(c => c.col !== col)
        return { ...g, settingsChanges: [...changes, { col, ...settings }].sort((a, b) => a.col - b.col) }
      }),
    })
    emitLogEvent({ type: "gas_change", ...settings, ts: timestampForColumn(col) ?? undefined })
    closeGasPicker()
  }

  function stopGas(segId: string, nowCol: number | null) {
    const d = dataRef.current
    const seg = (d.gasSettings ?? []).find(g => g.id === segId)
    if (!seg) return
    onChangeRef.current({ ...d, gasSettings: (d.gasSettings ?? []).map(g => g.id === segId ? { ...g, endCol: Math.max(nowCol ?? g.endCol, g.endCol), stopped: true } : g) })
    emitLogEvent({
      type: "gas_stop",
      ts: nowCol == null ? undefined : timestampForColumn(nowCol) ?? undefined,
    })
  }

  function removeGas(segId: string) {
    onChange({ ...data, gasSettings: gasSettings.filter(g => g.id !== segId) })
    closeGasPicker()
  }

  return {
    gasSettings, gasPicker, gasPickerRect, pickerFgf, setPickerFgf, pickerCarrierGas, setPickerCarrierGas, pickerFio2, setPickerFio2,
    openPickerForSeg, openPickerEmpty, closeGasPicker, startGas, applyGasChange, stopGas, removeGas,
  }
}
