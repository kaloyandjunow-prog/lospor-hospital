import { useState } from "react"
import { uid } from "@/lib/intraop-log-event"
import type { LogEvent, ActiveFluid } from "@/lib/intraop-log-event"

type FluidOption = { name: string; cat: string; color: string }

// Fluid start/end. `activeFluids` is shared state (read elsewhere in the
// screen for the running-items strip and end-case sheet), so it's passed in
// rather than owned here — same as activeAgent in useAgentEntry.
export function useFluidEntry(
  save: (partial: Omit<LogEvent, "id" | "ts">, tsOverride?: string, silent?: boolean) => Promise<LogEvent>,
  setEntryTs: (ts: string | null) => void,
  setActiveFluids: (updater: (prev: ActiveFluid[]) => ActiveFluid[]) => void,
) {
  const [flOpen, setFlOpen]   = useState(false)
  const [flFluid, setFlFluid] = useState<FluidOption | null>(null)
  const [flVol, setFlVol]     = useState("500")
  const [flConcentration, setFlConcentration] = useState<string | undefined>(undefined)

  const [flEndOpen, setFlEndOpen]     = useState(false)
  const [flEndTarget, setFlEndTarget] = useState<ActiveFluid | null>(null)
  const [flEndCustom, setFlEndCustom] = useState("")

  function openFluid(ts?: string) {
    setEntryTs(ts ?? null)
    setFlConcentration(undefined)
    setFlOpen(true)
  }

  function confirmFluid() {
    if (!flFluid) return
    const fl: ActiveFluid = { fluidId: uid(), name: flFluid.name, volume: flVol, color: flFluid.color }
    const category = flFluid.cat
    const concentration = flConcentration
    // Optimistic add + close the sheet synchronously, then fire the save.
    setActiveFluids(prev => [...prev, fl])
    setFlOpen(false); setFlFluid(null); setFlVol("500"); setFlConcentration(undefined)
    void save({ type: "fluid_start", fluidId: fl.fluidId, name: fl.name, volume: fl.volume, color: fl.color, category, concentration })
  }

  function openFluidEnd(fl: ActiveFluid) {
    setFlEndTarget(fl); setFlEndCustom(""); setFlEndOpen(true)
  }

  function confirmFluidEnd(label?: string) {
    if (!flEndTarget) return
    const fl = flEndTarget
    const name = label ? `${fl.name} (${label})` : fl.name
    setActiveFluids(prev => prev.filter(x => x.fluidId !== fl.fluidId))
    setFlEndOpen(false); setFlEndTarget(null)
    void save({ type: "fluid_end", fluidId: fl.fluidId, name, color: fl.color })
  }

  // Direct fluid stop used by end-case sheet (no modal, no flEndTarget state required)
  async function stopFluidDirect(fl: ActiveFluid) {
    setActiveFluids(prev => prev.filter(x => x.fluidId !== fl.fluidId))
    await save({ type: "fluid_end", fluidId: fl.fluidId, name: fl.name, color: fl.color })
  }

  return {
    flOpen, setFlOpen, flFluid, setFlFluid, flVol, setFlVol,
    flConcentration, setFlConcentration,
    flEndOpen, setFlEndOpen, flEndTarget, setFlEndTarget, flEndCustom, setFlEndCustom,
    openFluid, confirmFluid, openFluidEnd, confirmFluidEnd, stopFluidDirect,
  }
}
