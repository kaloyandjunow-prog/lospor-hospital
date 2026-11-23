"use client"

import { useState } from "react"
import type { ClockTime } from "@lospor/core/time-entry"
import { TimeWheel } from "@/components/time/TimeWheel"
import type { TIMETABLE_MENU_COPY } from "./timetable-menu-copy"

/**
 * The menu host's overlays (10.8.0): the time wheel, the tourniquet pair
 * question, "still running?" and the Undo bar. Presentational; the host
 * decides what each answer writes.
 */
type Copy = (typeof TIMETABLE_MENU_COPY)["bg"]

export function TimeWheelDialog({ title, initial, copy, onClose, onConfirm }: {
  title: string
  initial: ClockTime
  copy: Copy
  onClose: () => void
  onConfirm: (clock: ClockTime) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="w-full max-w-xs rounded-xl bg-white dark:bg-[#1f1f1f] p-4 shadow-xl">
        <p className="text-sm font-bold text-slate-900 dark:text-white mb-3">{title}</p>
        <TimeWheel value={value} onChange={setValue} labels={copy.wheel} />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="min-h-11 rounded-lg border border-slate-300 dark:border-[#4a4a4a] font-semibold" onClick={onClose}>{copy.cancel}</button>
          <button type="button" data-testid="time-wheel-confirm" className="min-h-11 rounded-lg bg-blue-600 text-white font-semibold" onClick={() => onConfirm(value)}>{copy.confirm}</button>
        </div>
      </div>
    </div>
  )
}

export function PairQuestion({ copy, onBoth, onOnlyThis, onCancel }: { copy: Copy; onBoth: () => void; onOnlyThis: () => void; onCancel: () => void }) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white dark:bg-[#1f1f1f] p-4 shadow-xl">
        <p className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{copy.pair.question}</p>
        <div className="flex flex-col gap-2">
          <button type="button" className="min-h-11 rounded-lg bg-red-600 text-white font-semibold" onClick={onBoth}>{copy.pair.both}</button>
          <button type="button" className="min-h-11 rounded-lg border border-slate-300 dark:border-[#4a4a4a] font-semibold" onClick={onOnlyThis}>{copy.pair.onlyThis}</button>
          <button type="button" className="min-h-11 rounded-lg font-semibold text-slate-500" onClick={onCancel}>{copy.cancel}</button>
        </div>
      </div>
    </div>
  )
}

export function StillRunningBar({ copy, title, time, onRunning, onStopped }: { copy: Copy; title: string; time: string; onRunning: () => void; onStopped: () => void }) {
  return (
    <div role="alertdialog" data-testid="still-running-question" className="fixed left-1/2 -translate-x-1/2 bottom-40 z-[66] flex flex-wrap items-center gap-2 rounded-2xl border border-amber-400 bg-amber-50 dark:bg-[#2a2110] px-4 py-2 shadow-xl max-w-[calc(100vw-16px)]">
      <span className="text-sm font-semibold text-slate-900 dark:text-white">{copy.stillRunning.question(title, time)}</span>
      <button type="button" data-testid="still-running-yes" className="min-h-11 rounded-full border border-emerald-400 px-4 text-sm font-bold text-emerald-700 dark:text-emerald-300" onClick={onRunning}>{copy.stillRunning.running}</button>
      <button type="button" data-testid="still-running-stopped" className="min-h-11 rounded-full border border-red-300 px-4 text-sm font-bold text-red-600" onClick={onStopped}>{copy.stillRunning.stopped}</button>
    </div>
  )
}

export function UndoBar({ copy, text, canUndo, onUndo }: { copy: Copy; text: string; canUndo: boolean; onUndo: () => void }) {
  return (
    <div role="status" data-testid="timetable-undo-bar" className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[65] flex items-center gap-3 rounded-full bg-slate-900 dark:bg-[#2a2a2a] text-white pl-4 pr-1.5 py-1.5 shadow-xl max-w-[calc(100vw-16px)]">
      <span className="text-sm truncate">{text}</span>
      {canUndo ? (
        <button type="button" data-testid="timetable-undo-bar-undo" className="min-h-11 min-w-11 rounded-full px-4 font-bold text-amber-300 hover:bg-white/10" onClick={onUndo}>
          {copy.undo}
        </button>
      ) : null}
    </div>
  )
}
