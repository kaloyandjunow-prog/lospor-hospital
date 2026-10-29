"use client"

import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import { useIntraopUiCopy } from "@/components/intraop/ui-copy"
import type { TimetableFluid } from "@/types/timetable"

export type FluidRateDialogState = { id: string; rate: string; rect: DOMRect }

export function FluidRateDialog({ state, fluid, displayName, onChange, onClose, onConfirm }: {
  state: FluidRateDialogState
  fluid: TimetableFluid | undefined
  displayName: (name: string) => string
  onChange: (rate: string) => void
  onClose: () => void
  onConfirm: (id: string, rate: number) => void
}) {
  const uiCopy = useIntraopUiCopy()
  if (!fluid || typeof document === "undefined") return null
  const { rect } = state
  const width = Math.min(240, window.innerWidth - 16)
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  const showAbove = window.innerHeight - rect.bottom < 240
  const top = showAbove ? rect.top - 4 : rect.bottom + 6
  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div className="fixed z-[9999] space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-[#3a3a3a] dark:bg-[#1e1e1e]" style={{ left, top, width, transform: showAbove ? "translateY(-100%)" : undefined }} onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">{displayName(fluid.name)} · {uiCopy.timetable.rateSuffix}</p>
          <button type="button" onClick={onClose} className="text-slate-300 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
        </div>
        <DoseSelector accent="cyan" value={state.rate} onValueChange={onChange} valuePlaceholder={uiCopy.rate} min={1} max={200} step={1} unitSuffix="mL/h" confirmLabel={uiCopy.infusion.changeRate} confirmDisabled={!state.rate || Number(state.rate) <= 0} onConfirm={() => onConfirm(state.id, Number(state.rate))} />
      </div>
    </>,
    document.body,
  )
}
