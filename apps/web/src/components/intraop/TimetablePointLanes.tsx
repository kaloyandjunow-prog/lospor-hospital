"use client"

import { Plus, X } from "lucide-react"
import type { TimetableDragState } from "./use-timetable-drag"
import type { TtSel } from "./timetable-types"
import type { TimetableData } from "@/types/timetable"

/**
 * The two lanes that record things which happened at a moment rather than over
 * a span: clinical events, and drug boluses.
 *
 * Unlike the agent and fluid lanes there is no bar geometry here — an entry
 * belongs to exactly one column and never crosses a row boundary — so these are
 * the simplest lanes on the chart and the ones a tired reader scans first.
 *
 * Both stack within their column and both cap what they draw: the events lane
 * shows five and then a count, because a column with eleven events would
 * otherwise push the whole chart row taller than the screen.
 *
 * Presentational: every change goes back through the callbacks.
 */

type LaneChrome = {
  label: string
  labelWidth: number
  rowLabelClass: string
  /** Absolute column indices this chart row covers. */
  rowCols: number[]
  colW: number
}

/** How many events a single column shows before collapsing to a count. */
const MAX_VISIBLE_EVENTS = 5

export type ClinicalEventsLaneProps = LaneChrome & {
  events: NonNullable<TimetableData["clinicalEvents"]>
  /** Translated event name, for both the chip and its tooltip. */
  displayEventName: (label: string) => string
  onOpenPicker: (col: number, rect: DOMRect) => void
  onRemove: (col: number, label: string) => void
}

export function ClinicalEventsLane({
  label,
  labelWidth,
  rowLabelClass,
  rowCols,
  colW,
  events,
  displayEventName,
  onOpenPicker,
  onRemove,
}: ClinicalEventsLaneProps) {
  return (
    <div
      className="flex items-stretch border-b border-slate-100 dark:border-[#2a2a2a] bg-slate-50/20 dark:bg-[#181818]/40"
      style={{ minHeight: 34 }}
    >
      <div style={{ width: labelWidth, minWidth: labelWidth }} className={rowLabelClass + " flex items-center justify-end py-1.5"}>
        {label}
      </div>
      {rowCols.map(ci => {
        const colEvents = events.filter(event => event.colIdx === ci)
        return (
          <div
            key={ci}
            style={{ width: colW, minWidth: colW }}
            className="group border-l border-slate-100 dark:border-[#2a2a2a] relative flex flex-col items-center justify-start py-0.5 px-0.5 cursor-pointer hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10 transition-colors"
            onClick={e => onOpenPicker(ci, (e.currentTarget as HTMLElement).getBoundingClientRect())}
          >
            {colEvents.length === 0 && (
              <Plus className="h-2.5 w-2.5 opacity-0 group-hover:opacity-30 transition-opacity text-slate-400 dark:text-[#666] mt-1.5" />
            )}
            <div className="flex flex-col items-start gap-0.5 w-full">
              {colEvents.slice(0, MAX_VISIBLE_EVENTS).map(event => (
                <div
                  key={event.label}
                  title={displayEventName(event.label)}
                  onClick={e => { e.stopPropagation(); onRemove(ci, event.label) }}
                  className="flex items-center rounded-full px-1 py-px cursor-pointer hover:opacity-60 transition-opacity select-none w-full min-w-0"
                  style={{ backgroundColor: event.color + "20", color: event.color, border: `1px solid ${event.color}40` }}
                >
                  <span className="text-[8px] font-bold truncate leading-tight">{displayEventName(event.label)}</span>
                </div>
              ))}
              {colEvents.length > MAX_VISIBLE_EVENTS && (
                <span className="text-[8px] text-slate-400 dark:text-[#666] font-medium px-0.5">
                  +{colEvents.length - MAX_VISIBLE_EVENTS}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export type DrugLaneProps = LaneChrome & {
  /** The whole case's drugs: an entry's index here is its identity elsewhere. */
  drugs: TimetableData["drugs"]
  displayDrugName: (name: string) => string
  sel: TtSel | null
  drag: TimetableDragState
  onDragOver: (event: React.DragEvent, col: number) => void
  onDragLeave: () => void
  onDrop: (event: React.DragEvent, col: number) => void
  onOpenPicker: (col: number, rect: DOMRect) => void
  onEditDose: (index: number, dose: string, unit: string, rect: DOMRect) => void
  onRemove: (index: number) => void
}

export function DrugLane({
  label,
  labelWidth,
  rowLabelClass,
  rowCols,
  colW,
  drugs,
  displayDrugName,
  sel,
  drag,
  onDragOver,
  onDragLeave,
  onDrop,
  onOpenPicker,
  onEditDose,
  onRemove,
}: DrugLaneProps) {
  return (
    <div className="flex min-h-[64px] border-t border-slate-100 dark:border-[#2a2a2a]">
      <div style={{ width: labelWidth, minWidth: labelWidth }} className={rowLabelClass + " py-3 flex items-start justify-end"}>
        {label}
      </div>
      {rowCols.map(ci => {
        const colDrugs = drugs.filter(drug => drug.colIdx === ci)
        return (
          <div
            key={ci}
            style={{ width: colW, minWidth: colW }}
            onDragOver={e => onDragOver(e, ci)}
            onDragLeave={onDragLeave}
            onDrop={e => onDrop(e, ci)}
            className={`border-l border-slate-100 dark:border-[#2a2a2a] px-1 py-1 space-y-0.5 transition-colors ${drag.dragOver === ci ? "bg-violet-50 dark:bg-violet-900/20" : ""}`}
          >
            {colDrugs.map(drug => {
              // Position in the case's own list, not in this column: that index
              // is what every handler below identifies the entry by.
              const gi = drugs.findIndex(candidate => candidate === drug)
              return (
                <div
                  key={gi}
                  draggable
                  title={`${displayDrugName(drug.name)}${drug.dose ? " — " + drug.dose + " " + drug.unit : ""}`}
                  onDragStart={e => {
                    e.stopPropagation()
                    e.dataTransfer.setData("item-type", "move-drug")
                    e.dataTransfer.setData("item-idx", String(gi))
                    e.dataTransfer.effectAllowed = "move"
                  }}
                  onClick={e => { e.stopPropagation(); onOpenPicker(ci, (e.currentTarget as HTMLElement).getBoundingClientRect()) }}
                  onDoubleClick={e => { e.stopPropagation(); onEditDose(gi, drug.dose, drug.unit, e.currentTarget.getBoundingClientRect()) }}
                  className={`flex items-start gap-1 rounded px-2 py-1 group cursor-grab active:cursor-grabbing transition-colors ${sel?.type === "drug" && sel.idx === gi ? "bg-violet-400 dark:bg-violet-600 ring-2 ring-violet-500 dark:ring-violet-400" : "bg-violet-100 dark:bg-violet-900/40 hover:bg-violet-200 dark:hover:bg-violet-800/40"}`}
                >
                  <span className="text-[10px] font-semibold text-violet-800 dark:text-violet-300 leading-tight truncate flex-1">
                    {displayDrugName(drug.name)}
                    {drug.dose && (
                      <>
                        <br />
                        <span className="font-normal font-mono text-[9px] opacity-90">{drug.dose} {drug.unit}</span>
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={e => { e.stopPropagation(); onRemove(gi) }}
                    className="opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity text-violet-400 hover:text-violet-700 shrink-0 mt-0.5"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              )
            })}
            <button
              type="button"
              tabIndex={-1}
              data-testid="add-drug"
              onClick={e => onOpenPicker(ci, (e.currentTarget as HTMLElement).getBoundingClientRect())}
              className="w-full mt-1 flex items-center justify-center gap-0.5 text-[10px] font-semibold rounded border border-dashed border-violet-300 dark:border-violet-700 text-violet-400 dark:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 py-1 transition-colors"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
