"use client"

import { ChevronDown, ChevronRight, Maximize2, Minimize2 } from "lucide-react"
import { TimetableHistoryButtons } from "./TimetableHistoryButtons"
import { useTimetableMenu } from "./TimetableMenuHost"

/**
 * The row above the chart: the vitals graph toggle, Undo / Redo, the
 * shortcuts and (10.8.0) full screen. Every control is a 44 px target.
 */
export function TimetableToolbar({ chartOpen, onToggleChart, legend, histDepth, labels, onUndo, onRedo, onShortcuts, fullscreen, onToggleFullscreen }: {
  chartOpen: boolean
  onToggleChart: () => void
  legend: { bp: string; hr: string }
  histDepth: { past: number; future: number; lastAt?: number }
  labels: { showChart: string; hideChart: string; undo: string; redo: string; shortcuts: string; fullscreen: string; exitFullscreen: string }
  onUndo: () => void
  onRedo: () => void
  onShortcuts: () => void
  fullscreen: boolean
  onToggleFullscreen: () => void
}) {
  // 10.8.0: Undo / Redo take the newer of the chart's own history and the menu's.
  const menu = useTimetableMenu()
  const history = menu?.history
  const menuNewer = (history?.lastAt ?? 0) > (histDepth.lastAt ?? 0)
  const undo = () => { if (history?.canUndo && (menuNewer || histDepth.past === 0) && history.undo()) return; onUndo() }
  const redo = () => { if (history?.canRedo && (menuNewer || histDepth.future === 0) && history.redo()) return; onRedo() }
  const depth = { past: histDepth.past + (history?.canUndo ? 1 : 0), future: histDepth.future + (history?.canRedo ? 1 : 0) }
  const pill = "flex items-center gap-2 min-h-11 px-4 rounded-full border text-sm font-medium transition-colors select-none"
  const quiet = "bg-white dark:bg-[#2a2a2a] border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-[#aaa] hover:border-slate-300 dark:hover:border-[#555]"
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" onClick={onToggleChart}
        className={`${pill} ${chartOpen ? "bg-slate-700 dark:bg-[#3a3a3a] border-slate-600 dark:border-[#555] text-white dark:text-slate-100" : quiet}`}>
        {chartOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {chartOpen ? labels.hideChart : labels.showChart}
        {chartOpen && (
          <span className="flex items-center gap-2 ml-1 text-xs font-normal opacity-80">
            <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px] bg-red-400 rounded" />{legend.bp}</span>
            <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px] bg-green-500 rounded" />{legend.hr}</span>
            <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px] bg-cyan-500 rounded" />SpO2</span>
            <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px] bg-amber-500 rounded" />EtCO2</span>
          </span>
        )}
      </button>
      <TimetableHistoryButtons depth={depth} undoLabel={labels.undo} redoLabel={labels.redo} onUndo={undo} onRedo={redo} />
      <button type="button" onClick={onShortcuts} className={`${pill} ${quiet}`}>⌨ {labels.shortcuts}</button>
      <button type="button" data-testid="timetable-fullscreen" onClick={onToggleFullscreen} aria-pressed={fullscreen} className={`${pill} ${quiet} ml-auto`}>
        {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        {fullscreen ? labels.exitFullscreen : labels.fullscreen}
      </button>
    </div>
  )
}
