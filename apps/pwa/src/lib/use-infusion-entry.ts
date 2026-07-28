import { useState } from "react"
import { uid } from "@/lib/intraop-log-event"
import type { LogEvent, ActiveInfusion } from "@/lib/intraop-log-event"

type InfusionOption = { name: string; unit: string; color: string }
type CodedIdentity = { drugId?: string; atcCode?: string; inn?: string }

// Infusion start/rate-change/stop. `activeInfusions` is shared state (read
// elsewhere for the running-items strip and end-case sheet), so it's passed
// in rather than owned here — same pattern as useFluidEntry/useAgentEntry.
export function useInfusionEntry(
  save: (partial: Omit<LogEvent, "id" | "ts">, tsOverride?: string, silent?: boolean) => Promise<LogEvent>,
  setEntryTs: (ts: string | null) => void,
  setActiveInfusions: (updater: (prev: ActiveInfusion[]) => ActiveInfusion[]) => void,
  // Coded identity by drug name — empty today, see use-drug-entry.ts.
  infusionCodes: Record<string, CodedIdentity> = {},
) {
  const [infOpen, setInfOpen] = useState(false)
  const [infDrug, setInfDrug] = useState<InfusionOption | null>(null)
  const [infRate, setInfRate] = useState("")
  const [infRoute, setInfRoute] = useState<string | undefined>(undefined)
  const [infConcentration, setInfConcentration] = useState<string | undefined>(undefined)

  const [infActOpen, setInfActOpen] = useState(false)
  const [infActTgt, setInfActTgt]   = useState<ActiveInfusion | null>(null)
  const [infActRate, setInfActRate] = useState("")
  const [infActConcentration, setInfActConcentration] = useState<string | undefined>(undefined)
  // Timestamp of the timetable column the rate change is being made at. A
  // dedicated field (not the shared entryTs) so opening/closing the manage
  // sheet can't leave a stale timestamp that a later unrelated event would
  // pick up. null = stamp at "now" (real-time charting).
  const [infActTs, setInfActTs] = useState<string | null>(null)

  function openInfusion(ts?: string) {
    setEntryTs(ts ?? null)
    setInfOpen(true)
  }

  function confirmInfusion() {
    if (!infDrug || !infRate) return
    const codes = infusionCodes[infDrug.name]
    const inf: ActiveInfusion = { infId: uid(), name: infDrug.name, rate: infRate, unit: infDrug.unit, color: infDrug.color, concentration: infConcentration, route: infRoute, drugId: codes?.drugId, atcCode: codes?.atcCode, inn: codes?.inn }
    // Optimistic add + close the sheet synchronously, then fire the save.
    setActiveInfusions(prev => [...prev, inf])
    setInfOpen(false); setInfDrug(null); setInfRate(""); setInfRoute(undefined); setInfConcentration(undefined)
    void save({ type: "infusion_start", infId: inf.infId, name: inf.name, rate: inf.rate, unit: inf.unit, color: inf.color, concentration: inf.concentration, drugRoute: inf.route, drugId: inf.drugId, atcCode: inf.atcCode, inn: inf.inn })
  }

  async function stopInfusion(inf: ActiveInfusion) {
    setActiveInfusions(prev => prev.filter(x => x.infId !== inf.infId))
    await save({ type: "infusion_stop", infId: inf.infId, name: inf.name, color: inf.color })
  }

  function changeRate(inf: ActiveInfusion, rate: string, concentration?: string) {
    setActiveInfusions(prev => prev.map(x => x.infId === inf.infId ? { ...x, rate, concentration: concentration ?? x.concentration } : x))
    const atTs = infActTs
    setInfActOpen(false); setInfActTgt(null); setInfActRate(""); setInfActConcentration(undefined); setInfActTs(null)
    // Stamp the rate change at the timetable column the user was editing (infActTs)
    // so the split lands there, not at wall-clock "now". Falls back to now when
    // opened without a column context (real-time charting).
    void save({ type: "infusion_rate", infId: inf.infId, name: inf.name, rate, unit: inf.unit, color: inf.color, concentration: concentration ?? inf.concentration }, atTs ?? undefined)
  }

  return {
    infOpen, setInfOpen, infDrug, setInfDrug, infRate, setInfRate,
    infRoute, setInfRoute, infConcentration, setInfConcentration,
    infActOpen, setInfActOpen, infActTgt, setInfActTgt, infActRate, setInfActRate,
    infActConcentration, setInfActConcentration, infActTs, setInfActTs,
    openInfusion, confirmInfusion, stopInfusion, changeRate,
  }
}
