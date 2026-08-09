"use client"
import { useState } from "react"
import { useLocale } from "next-intl"
import { createPortal } from "react-dom"
import type { AgentSegment, TimetableInfusion, TimetableFluid, GasSettingsSegment } from "@/components/IntraopTimetable"
import { calcInfusionTotal, type WeightBasisMap } from "@/lib/infusion-calc"
import { displayClinicalCode } from "@/lib/clinical-display"
import { currentFluidRate, fluidDeliveredVolumeMl } from "@/lib/fluid-entry-ui"

type EndCaseDecision = "discontinue" | "continue" | null

export interface EndCaseModalProps {
  agents: AgentSegment[]
  infusions: TimetableInfusion[]
  fluids: TimetableFluid[]
  gasSettings?: GasSettingsSegment[]
  weightBasis: WeightBasisMap
  onDismiss: () => void
  onConfirm: (result: {
    continuedItems: string[]
    infusionTotals: { name: string; total: number; unit: string }[]
    discontinuedAgentCols: number[]
    discontinuedInfusionIds: string[]
    finalizedFluidWithAmounts: { id: string; amount: number; category: string; endTs: string }[]
    discontinuedGasIds: string[]
  }) => void
}

export function EndCaseModal({ agents, infusions, fluids, gasSettings = [], weightBasis, onDismiss, onConfirm }: EndCaseModalProps) {
  const locale = useLocale()
  const [decisions, setDecisions] = useState<Record<string, EndCaseDecision>>({})
  const [fluidAmounts, setFluidAmounts] = useState<Record<string, string>>({})
  const [fluidFullBag, setFluidFullBag] = useState<Record<string, boolean | null>>({})

  function setDecision(key: string, val: EndCaseDecision) {
    setDecisions(prev => ({ ...prev, [key]: prev[key] === val ? null : val }))
  }

  const allDecisionsMade = agents.every(agent => decisions[`agent-${agent.startCol}`] != null)
    && infusions.every(infusion => decisions[`inf-${infusion.id}`] != null)
    && fluids.every(fluid => decisions[`fluid-${fluid.id}`] != null)
    && gasSettings.every(gas => decisions[`gas-${gas.id}`] != null)
  const allFluidAmountsComplete = fluids.every(fluid => {
    const enteredAmount = fluidAmounts[fluid.id]
    if (fluid.fluidEntryMode === "RATE") {
      if (enteredAmount == null || enteredAmount.trim() === "") return true
      const amount = Number(enteredAmount)
      return Number.isFinite(amount) && amount >= 0
    }
    const fullBag = fluidFullBag[fluid.id]
    if (fullBag == null) return false
    if (fullBag) return true
    if (enteredAmount == null || enteredAmount.trim() === "") return false
    const amount = Number(enteredAmount)
    return Number.isFinite(amount) && amount >= 0
  })
  const canConfirm = allDecisionsMade && allFluidAmountsComplete

  function handleConfirm() {
    if (!canConfirm) return
    const continuedItems: string[] = []
    const infusionTotals: { name: string; total: number; unit: string }[] = []
    const discontinuedAgentCols: number[] = []
    const discontinuedInfusionIds: string[] = []
    const finalizedFluidWithAmounts: { id: string; amount: number; category: string; endTs: string }[] = []
    const discontinuedGasIds: string[] = []
    const fluidEndTs = new Date().toISOString()

    for (const a of agents) {
      const d = decisions[`agent-${a.startCol}`]
      if (d === "continue") continuedItems.push(`${a.name} (inhalational agent)`)
      if (d === "discontinue") discontinuedAgentCols.push(a.startCol)
    }
    for (const inf of infusions) {
      const d = decisions[`inf-${inf.id}`]
      if (d === "continue") continuedItems.push(`${inf.name} infusion (${inf.rate} ${inf.unit})`)
      if (d === "discontinue") {
        const tot = calcInfusionTotal(inf, null, null, weightBasis)
        infusionTotals.push({ name: inf.name, total: tot.amount, unit: tot.unit })
        discontinuedInfusionIds.push(inf.id)
      }
    }
    for (const f of fluids) {
      const d = decisions[`fluid-${f.id}`]
      const cat = f.category ?? "Crystalloids"
      if (d === "continue") continuedItems.push(
        f.fluidEntryMode === "RATE"
          ? `${f.name} (fluid at ${currentFluidRate(f) ?? f.rate ?? ""} mL/h)`
          : `${f.name} (fluid)`,
      )
      const enteredAmount = fluidAmounts[f.id]
      const amt = enteredAmount == null || enteredAmount === ""
        ? f.fluidEntryMode === "RATE"
          ? fluidDeliveredVolumeMl(f, fluidEndTs)
          : 0
        : Number(enteredAmount) || 0
      finalizedFluidWithAmounts.push({ id: f.id, amount: amt, category: cat, endTs: fluidEndTs })
    }
    for (const g of gasSettings) {
      if (decisions[`gas-${g.id}`] === "discontinue") discontinuedGasIds.push(g.id)
    }
    onConfirm({ continuedItems, infusionTotals, discontinuedAgentCols, discontinuedInfusionIds, finalizedFluidWithAmounts, discontinuedGasIds })
  }

  const pillBase = "text-xs px-2.5 py-1 rounded-full border font-semibold transition-colors"

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onDismiss() }}>
      <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto">
        <div className="mb-4">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">End Case — Active Items</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Choose what to do with each active item.</p>
        </div>

        {agents.length === 0 && infusions.length === 0 && fluids.length === 0 && gasSettings.length === 0 && (
          <p className="text-sm text-slate-400 py-4 text-center">No active items — ready to end.</p>
        )}

        {agents.map(a => {
          const key = `agent-${a.startCol}`
          const d = decisions[key]
          return (
            <div key={a.startCol} className="flex items-center justify-between gap-2 py-3 border-b border-slate-100 dark:border-[#2e2e2e]">
              <div>
                <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">{displayClinicalCode("option:INHALATIONAL_AGENT", a.name, locale, { label: a.name })}</span>
                <span className="ml-2 text-[10px] text-slate-400">inhalational</span>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button type="button" onClick={() => setDecision(key, "discontinue")}
                  className={`${pillBase} ${d === "discontinue" ? "bg-red-500 text-white border-red-500" : "border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"}`}>
                  Discontinue
                </button>
                <button type="button" onClick={() => setDecision(key, "continue")}
                  className={`${pillBase} ${d === "continue" ? "bg-emerald-500 text-white border-emerald-500" : "border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"}`}>
                  Continue postop
                </button>
              </div>
            </div>
          )
        })}

        {infusions.map(inf => {
          const key = `inf-${inf.id}`
          const d = decisions[key]
          const tot = d === "discontinue" ? calcInfusionTotal(inf, null, null, weightBasis) : null
          return (
            <div key={inf.id} className="py-3 border-b border-slate-100 dark:border-[#2e2e2e] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-semibold" style={{ color: inf.color }}>{displayClinicalCode("option:INTRAOP_INFUSION", inf.name, locale, { label: inf.name })}</span>
                  <span className="ml-2 text-[10px] text-slate-400">{inf.rate} {inf.unit}</span>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button type="button" onClick={() => setDecision(key, "discontinue")}
                    className={`${pillBase} ${d === "discontinue" ? "bg-red-500 text-white border-red-500" : "border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"}`}>
                    Discontinue
                  </button>
                  <button type="button" onClick={() => setDecision(key, "continue")}
                    className={`${pillBase} ${d === "continue" ? "bg-emerald-500 text-white border-emerald-500" : "border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"}`}>
                    Continue postop
                  </button>
                </div>
              </div>
              {tot && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 pl-0.5">
                  Estimated total: <span className="font-semibold">{tot.amount} {tot.unit}</span>
                </p>
              )}
            </div>
          )
        })}

        {fluids.map(f => {
          const key = `fluid-${f.id}`
          const d = decisions[key]
          const isRate = f.fluidEntryMode === "RATE"
          const currentRate = currentFluidRate(f)
          return (
            <div key={f.id} className="py-3 border-b border-slate-100 dark:border-[#2e2e2e] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-semibold" style={{ color: f.color }}>{displayClinicalCode("option:INTRAOP_FLUID", f.name, locale, { label: f.name })}</span>
                  <span className="ml-2 text-[10px] text-slate-400">{displayClinicalCode("optionGroup", f.category ?? "Other", locale, { label: f.category ?? "Other" })}</span>
                  {isRate && <span className="ml-2 text-[10px] font-semibold text-cyan-600 dark:text-cyan-400">{currentRate ?? f.rate ?? ""} mL/h</span>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button type="button" onClick={() => setDecision(key, "discontinue")}
                    className={`${pillBase} ${d === "discontinue" ? "bg-red-500 text-white border-red-500" : "border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"}`}>
                    Discontinue
                  </button>
                  <button type="button" onClick={() => setDecision(key, "continue")}
                    className={`${pillBase} ${d === "continue" ? "bg-emerald-500 text-white border-emerald-500" : "border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"}`}>
                    Continue postop
                  </button>
                </div>
              </div>
              {d !== null && d !== undefined && (() => {
                const bagVol = Number(f.bagVolumeMl ?? f.volume) || 500
                const estimatedRateVolume = isRate ? fluidDeliveredVolumeMl(f, new Date()) : 0
                const displayedAmount = fluidAmounts[f.id] ?? (isRate ? String(estimatedRateVolume) : "0")
                const curAmt = Number(displayedAmount) || 0
                const fb = fluidFullBag[f.id] ?? null
                if (isRate) return (
                  <div className="pl-0.5 space-y-2">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Calculated delivered volume. Replace it with the pump total if needed.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        type="number"
                        min={0}
                        step={1}
                        aria-label={`Actual delivered volume for ${f.name}`}
                        value={displayedAmount}
                        onChange={event => setFluidAmounts(previous => ({ ...previous, [f.id]: event.target.value }))}
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs outline-none focus:border-cyan-400 dark:border-[#3a3a3a] dark:bg-[#2a2a2a]"
                      />
                      <span className="text-[11px] font-semibold text-slate-400">mL</span>
                    </div>
                  </div>
                )
                return (
                  <div className="pl-0.5 space-y-2">
                    <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Was the full bag infused?</p>
                    <div className="flex gap-2">
                      <button type="button"
                        onClick={() => { setFluidFullBag(prev => ({ ...prev, [f.id]: true })); setFluidAmounts(prev => ({ ...prev, [f.id]: String(bagVol) })) }}
                        className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg border-2 transition-colors ${fb === true ? "bg-teal-500 border-teal-500 text-white" : "border-teal-300 dark:border-teal-700 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20"}`}>
                        ✓ Yes — full bag
                      </button>
                      <button type="button"
                        onClick={() => { setFluidFullBag(prev => ({ ...prev, [f.id]: false })); setFluidAmounts(prev => ({ ...prev, [f.id]: "0" })) }}
                        className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg border-2 transition-colors ${fb === false ? "bg-amber-500 border-amber-500 text-white" : "border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"}`}>
                        No — partial
                      </button>
                    </div>
                    {fb === false && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">Amount:</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={bagVol}
                              step={1}
                              aria-label={`Partial bag volume for ${f.name}`}
                              value={displayedAmount}
                              onChange={event => setFluidAmounts(previous => ({ ...previous, [f.id]: event.target.value }))}
                              className="w-20 rounded border border-slate-200 bg-white px-1 py-0.5 text-right text-[11px] font-semibold outline-none focus:border-cyan-400 dark:border-[#3a3a3a] dark:bg-[#2a2a2a]"
                            />
                            <span className="text-[10px] text-slate-400">mL</span>
                          </div>
                        </div>
                        <input type="range" min={0} max={bagVol} step={50}
                          value={curAmt}
                          onChange={e => setFluidAmounts(prev => ({ ...prev, [f.id]: e.target.value }))}
                          className="w-full accent-teal-500 cursor-pointer" />
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )
        })}

        {gasSettings.map(g => {
          const key = `gas-${g.id}`
          const d = decisions[key]
          return (
            <div key={g.id} className="flex items-center justify-between gap-2 py-3 border-b border-slate-100 dark:border-[#2e2e2e]">
              <div>
                <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Gas settings</span>
                <span className="ml-2 text-[10px] text-slate-400">FGF {g.fgf}L/min · FiO2 {g.fio2}%</span>
              </div>
              <button type="button" onClick={() => setDecision(key, "discontinue")}
                className={`${pillBase} ${d === "discontinue" ? "bg-red-500 text-white border-red-500" : "border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"}`}>
                Discontinue
              </button>
            </div>
          )
        })}

        {!canConfirm && (agents.length > 0 || infusions.length > 0 || fluids.length > 0 || gasSettings.length > 0) && (
          <p className="pt-3 text-right text-[11px] text-amber-600 dark:text-amber-400">
            Choose an action for every item and confirm each bag amount.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={onDismiss}
            className="text-sm px-4 py-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-500 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} disabled={!canConfirm}
            className="text-sm px-4 py-2 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-red-500">
            Confirm End Case
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
