import { useEffect, useState } from "react"
import { normalizeGasSettings } from "@lospor/core/intraop-summary"
import type { LogEvent, ActiveGasSettings } from "@/lib/intraop-log-event"

// FGF/carrier-gas/FiO2 lifecycle: manual start → change (any number of times,
// tracked like infusion rate-changes since FiO2 is titrated continuously) →
// stop (with confirmation, mirroring the agent discontinue pattern). Only
// one gas-settings entry runs at a time, unlike infusions. Visible (row
// shown) whenever the agent row is — same GA-technique gating — but starts
// unstarted until manually opened.
export function useGasSettingsEntry(
  save: (partial: Omit<LogEvent, "id" | "ts">, tsOverride?: string, silent?: boolean) => Promise<LogEvent>,
  setEntryTs: (ts: string | null) => void,
  activeGas: ActiveGasSettings,
  setActiveGas: (g: ActiveGasSettings) => void,
) {
  const [gasOpen, setGasOpen] = useState(false)
  const [gasFgf, setGasFgf] = useState<number | null>(null)
  const [gasCarrierGas, setGasCarrierGas] = useState<string | null>(null)
  const [gasFio2, setGasFio2] = useState(100)
  const [gasMode, setGasMode] = useState<"start" | "change">("start")

  useEffect(() => {
    if (gasCarrierGas == null && gasFio2 !== 100) setGasFio2(100)
  }, [gasCarrierGas, gasFio2])

  function openGasSettings(ts?: string, initial?: NonNullable<ActiveGasSettings>, mode?: "start" | "change") {
    setEntryTs(ts ?? null)
    setGasMode(mode ?? (activeGas ? "change" : "start"))
    if (initial) { setGasFgf(initial.fgf); setGasCarrierGas(initial.carrierGas); setGasFio2(initial.fio2) }
    else if (activeGas) { setGasFgf(activeGas.fgf); setGasCarrierGas(activeGas.carrierGas); setGasFio2(activeGas.fio2) }
    else { setGasFgf(null); setGasCarrierGas(null); setGasFio2(100) }
    setGasOpen(true)
  }

  async function confirmGasSettings() {
    const settings = normalizeGasSettings(gasFgf ?? 0, gasCarrierGas, gasFio2)
    const isChange = gasMode === "change"
    setActiveGas(settings)
    await save({ type: isChange ? "gas_change" : "gas_start", ...settings })
    setGasOpen(false)
  }

  async function stopGasSettings() {
    if (!activeGas) return
    setActiveGas(null)
    await save({ type: "gas_stop" })
  }

  return { gasOpen, setGasOpen, gasFgf, setGasFgf, gasCarrierGas, setGasCarrierGas, gasFio2, setGasFio2, openGasSettings, confirmGasSettings, stopGasSettings }
}
