import type { SaveIntraopEvent, StampFor } from "@/lib/intraop-stamp"
import { useState } from "react"
import { uid } from "@/lib/intraop-log-event"
import type {
  ActiveFluid,
  FluidEntryMode,
  FluidRateChange,
} from "@/lib/intraop-log-event"
import { calculatedFluidVolumeMl, fluidEntryModeOf } from "@/lib/fluid-entry"
import type { EndCaseStopContext } from "@/components/intraop/EndCaseSheet"
import type { PediatricFluidProfileRule } from "@lospor/core/clinical-rules"

type FluidOption = { name: string; cat: string; color: string }

// Fluid start/end. `activeFluids` is shared state (read elsewhere in the
// screen for the running-items strip and end-case sheet), so it's passed in
// rather than owned here — same as activeAgent in useAgentEntry.
export function useFluidEntry(
  save: SaveIntraopEvent,
  setEntryTs: (ts: string | null) => void,
  setActiveFluids: (updater: (prev: ActiveFluid[]) => ActiveFluid[]) => void,
  // Row time → instant to record (Core stamp rule). Defaults to now, to the minute.
  stampFor: StampFor = () => new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString(),
) {
  const [flOpen, setFlOpen]   = useState(false)
  const [flFluid, setFlFluid] = useState<FluidOption | null>(null)
  const [flVol, setFlVol]     = useState("")
  const [flEntryMode, setFlEntryMode] = useState<FluidEntryMode>("VOLUME")
  const [flRate, setFlRate] = useState("")
  const [flStartedAt, setFlStartedAt] = useState<string | null>(null)
  const [flConcentration, setFlConcentration] = useState<string | undefined>(undefined)
  const [flRoute, setFlRoute] = useState<string | undefined>(undefined)
  const [flRule, setFlRule] = useState<Pick<
    PediatricFluidProfileRule,
    "ruleKey" | "ruleVersion" | "sourceIds"
  > | null>(null)

  const [flEndOpen, setFlEndOpen]     = useState(false)
  const [flEndTarget, setFlEndTarget] = useState<ActiveFluid | null>(null)
  const [flEndCustom, setFlEndCustom] = useState("")
  const [flEndRate, setFlEndRate] = useState("")
  // The row the end/rate sheet was opened from; null = now.
  const [flEndTs, setFlEndTs] = useState<string | null>(null)

  function resetFluidDraft() {
    setFlFluid(null)
    setFlVol("")
    setFlRate("")
    setFlEntryMode("VOLUME")
    setFlStartedAt(null)
    setFlConcentration(undefined)
    setFlRoute(undefined)
    setFlRule(null)
  }

  function openFluid(ts?: string) {
    setEntryTs(ts ?? null)
    resetFluidDraft()
    setFlStartedAt(ts ?? null)
    setFlOpen(true)
  }

  function confirmFluid() {
    if (!flFluid) return
    const startedAt = stampFor(flStartedAt)
    const bagVolumeMl = flEntryMode === "VOLUME" ? Number(flVol) : undefined
    const rate = flEntryMode === "RATE" ? flRate : undefined
    if (flEntryMode === "VOLUME" && (!Number.isFinite(bagVolumeMl) || bagVolumeMl! <= 0)) return
    if (flEntryMode === "RATE" && (!Number.isFinite(Number(rate)) || Number(rate) <= 0)) return
    const fl: ActiveFluid = {
      fluidId: uid(),
      name: flFluid.name,
      volume: flEntryMode === "VOLUME" ? flVol : "",
      color: flFluid.color,
      fluidEntryMode: flEntryMode,
      ...(bagVolumeMl !== undefined ? { bagVolumeMl } : {}),
      ...(rate !== undefined ? { initialRate: rate, rate, unit: "mL/h" as const } : {}),
      startTs: startedAt,
      rateChanges: [],
      category: flFluid.cat,
      concentration: flConcentration,
      clinicalRuleKey: flRule?.ruleKey,
      clinicalRuleVersion: flRule?.ruleVersion,
      clinicalRuleSourceIds: flRule?.sourceIds,
    }
    const category = flFluid.cat
    const concentration = flConcentration
    // Optimistic add + close the sheet synchronously, then fire the save.
    setActiveFluids(prev => [...prev, fl])
    setFlOpen(false)
    resetFluidDraft()
    void save({
      type: "fluid_start",
      fluidId: fl.fluidId,
      name: fl.name,
      volume: fl.volume,
      color: fl.color,
      category,
      concentration,
      drugRoute: flRoute,
      clinicalRuleKey: flRule?.ruleKey,
      clinicalRuleVersion: flRule?.ruleVersion,
      clinicalRuleSourceIds: flRule?.sourceIds,
      fluidEntryMode: fl.fluidEntryMode,
      bagVolumeMl: fl.bagVolumeMl,
      rate: fl.rate,
      unit: fl.unit,
    }, startedAt)
  }

  function openFluidEnd(fl: ActiveFluid, rowTs?: string | null) {
    setFlEndTs(rowTs ?? null)
    setFlEndTarget(fl)
    setFlEndCustom("")
    setFlEndRate(fl.rate ?? "")
    setFlEndOpen(true)
  }

  function confirmFluidEnd(administeredVolumeMl?: number) {
    if (!flEndTarget) return
    const fl = flEndTarget
    // Recorded at the row the stop was entered in, not when it was tapped.
    const endedAt = stampFor(flEndTs)
    const resolvedVolumeMl = administeredVolumeMl ?? calculatedFluidVolumeMl(fl, endedAt)
    setActiveFluids(prev => prev.filter(x => x.fluidId !== fl.fluidId))
    setFlEndOpen(false); setFlEndTarget(null)
    void save({
      type: "fluid_end",
      fluidId: fl.fluidId,
      name: fl.name,
      color: fl.color,
      fluidEntryMode: fluidEntryModeOf(fl),
      administeredVolumeMl: resolvedVolumeMl,
      volume: String(resolvedVolumeMl),
    }, endedAt)
  }

  function changeFluidRate() {
    if (!flEndTarget || fluidEntryModeOf(flEndTarget) !== "RATE") return
    const numericRate = Number(flEndRate)
    if (!Number.isFinite(numericRate) || numericRate <= 0) return
    const changedAt = stampFor(flEndTs)
    const change: FluidRateChange = { ts: changedAt, rate: flEndRate, unit: "mL/h" }
    const targetId = flEndTarget.fluidId
    setActiveFluids(prev => prev.map(fluid => fluid.fluidId === targetId
      ? { ...fluid, rate: flEndRate, unit: "mL/h", rateChanges: [...(fluid.rateChanges ?? []), change] }
      : fluid))
    setFlEndTarget(current => current
      ? { ...current, rate: flEndRate, unit: "mL/h", rateChanges: [...(current.rateChanges ?? []), change] }
      : current)
    void save({
      type: "fluid_rate",
      fluidId: targetId,
      name: flEndTarget.name,
      color: flEndTarget.color,
      fluidEntryMode: "RATE",
      rate: flEndRate,
      unit: "mL/h",
    }, changedAt)
  }

  // Direct fluid stop used by end-case sheet (no modal, no flEndTarget state required)
  async function stopFluidDirect(fl: ActiveFluid, context?: EndCaseStopContext) {
    const endedAt = context?.endTs ?? stampFor(null)
    const administeredVolumeMl = context?.administeredVolumeMl ?? calculatedFluidVolumeMl(fl, endedAt)
    setActiveFluids(prev => prev.filter(x => x.fluidId !== fl.fluidId))
    await save({
      type: "fluid_end",
      fluidId: fl.fluidId,
      name: fl.name,
      color: fl.color,
      fluidEntryMode: fluidEntryModeOf(fl),
      administeredVolumeMl,
      volume: String(administeredVolumeMl),
      // A stop End case made: Resume offers to remove exactly these.
      ...(context ? { endCaseStop: true } : {}),
    }, endedAt)
  }

  return {
    flOpen, setFlOpen, flFluid, setFlFluid, flVol, setFlVol,
    flEntryMode, setFlEntryMode, flRate, setFlRate, resetFluidDraft,
    flConcentration, setFlConcentration,
    flRoute, setFlRoute, flRule, setFlRule,
    flEndOpen, setFlEndOpen, flEndTarget, setFlEndTarget, flEndCustom, setFlEndCustom,
    flEndRate, setFlEndRate, changeFluidRate,
    openFluid, confirmFluid, openFluidEnd, confirmFluidEnd, stopFluidDirect,
  }
}
