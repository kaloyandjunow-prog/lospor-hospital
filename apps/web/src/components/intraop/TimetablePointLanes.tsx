"use client"

import { useRef } from "react"
import { Plus } from "lucide-react"
import { useTimetableMenu } from "./TimetableMenuHost"
import { ttCell, ttLane, ttPoint } from "./chart-cursor"
import type { TimetableDragState } from "./use-timetable-drag"
import type { TtSel } from "./timetable-types"
import { SaveMark } from "./SaveMark"
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
export const MAX_VISIBLE_EVENTS = 8

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
  const menu = useTimetableMenu()
  return (
    <div
      {...ttLane("events")}
      className="flex items-stretch border-b border-slate-100 dark:border-[#2a2a2a] bg-slate-50/20 dark:bg-[#181818]/40"
      style={{ minHeight: 44 }}
    >
      <div data-tt-label style={{ width: labelWidth, minWidth: labelWidth }} className={rowLabelClass + " flex items-center justify-end py-1.5"}>
        {label}
      </div>
      {rowCols.map(ci => {
        const colEvents = events.filter(event => event.colIdx === ci)
        return (
          <div
            key={ci}
            style={{ width: colW, minWidth: colW }}
            className="group border-l border-slate-100 dark:border-[#2a2a2a] relative flex flex-col items-center justify-start py-0.5 px-0.5 cursor-pointer hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10 transition-colors"
            data-testid={`events-lane-col-${ci}`}
            {...ttCell(ci)}
            onClick={e => onOpenPicker(ci, (e.currentTarget as HTMLElement).getBoundingClientRect())}
          >
            {colEvents.length === 0 && (
              <Plus className="tt-add h-3.5 w-3.5 text-slate-400 dark:text-[#666] mt-1.5" data-now={ci === (menu?.facts.nowCol ?? null) ? "" : undefined} />
            )}
            <div className="flex flex-col items-start gap-1 w-full">
              {colEvents.slice(0, MAX_VISIBLE_EVENTS).map(event => (
                <div
                  key={event.label}
                  {...ttPoint((event as { eventId?: string }).eventId)}
                  title={displayEventName(event.label)}
                  onClick={e => {
                    e.stopPropagation()
                    const eventId = (event as { eventId?: string }).eventId
                    // 10.8.0: Edit / Move / Delete; without the menu, the old tap-to-remove.
                    if (eventId && menu?.openPoint({ eventId, rect: e.currentTarget.getBoundingClientRect(), title: displayEventName(event.label) })) return
                    onRemove(ci, event.label)
                  }}
                  className={`relative flex items-center rounded-full px-2 min-h-[28px] cursor-pointer hover:brightness-110 transition select-none w-full min-w-0 ${event.planned ? "opacity-50" : ""}`}
                  style={{ backgroundColor: event.color + "20", color: event.color, border: `1px ${event.planned ? "dashed" : "solid"} ${event.color}40` }}
                >
                  <SaveMark eventIds={[(event as { eventId?: string }).eventId]} />
                  <span className="text-xs font-bold truncate leading-tight" data-testid={`events-lane-chip-${event.kind ?? "event"}`}>
                    {displayEventName(event.label)}{event.kind === "defibrillation" && event.energyJ != null ? ` ${event.energyJ} J` : ""}
                  </span>
                </div>
              ))}
              {colEvents.length > MAX_VISIBLE_EVENTS && (
                <span className="text-xs text-slate-500 dark:text-[#888] font-semibold px-0.5" data-testid={`events-lane-more-${ci}`}>
                  +{colEvents.length - MAX_VISIBLE_EVENTS}
                </span>
              )}
            </div>
            {/* The chips fill the cell, so a cell with two events used to have nowhere left to click to add a third.
                This strip is always there below them; the click goes to the cell, which opens the picker. */}
            {colEvents.length > 0 && (
              <div
                data-testid={`events-lane-add-${ci}`}
                aria-label={label}
                className="mt-0.5 flex min-h-[18px] w-full items-center justify-center rounded text-slate-400 dark:text-[#666] opacity-60 hover:opacity-100 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/20 transition-opacity"
              >
                <Plus className="h-3 w-3" />
              </div>
            )}
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
  /** A drug's colour, as its menu chip has it (10.0.0); violet when it has none. */
  drugChip?: (name: string) => { className: string; style?: React.CSSProperties } | null
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
  drugChip,
  sel,
  drag,
  onDragOver,
  onDragLeave,
  onDrop,
  onOpenPicker,
  onEditDose,
}: DrugLaneProps) {
  // Whether the last press on a drug was a finger (its tap then opens the dose).
  const lastPointer = useRef("mouse")
  const menu = useTimetableMenu()
  return (
    <div {...ttLane("drugs")} className="flex min-h-[64px] border-t border-slate-100 dark:border-[#2a2a2a]">
      <div data-tt-label style={{ width: labelWidth, minWidth: labelWidth }} className={rowLabelClass + " py-3 flex items-start justify-end"}>
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
            {...ttCell(ci)}
            className={`border-l border-slate-100 dark:border-[#2a2a2a] px-1 py-1 space-y-0.5 transition-colors ${drag.dragOver === ci ? "bg-violet-50 dark:bg-violet-900/20" : ""}`}
          >
            {colDrugs.map(drug => {
              // Position in the case's own list, not in this column: that index
              // is what every handler below identifies the entry by.
              const gi = drugs.findIndex(candidate => candidate === drug)
              const chip = drugChip?.(drug.name) ?? null
              const selected = sel?.type === "drug" && sel.idx === gi
              const tone = chip
                ? `border ${chip.className} hover:brightness-95 dark:hover:brightness-125 ${selected ? "ring-2 ring-violet-500 dark:ring-violet-400" : ""}`
                : selected ? "bg-violet-400 dark:bg-violet-600 ring-2 ring-violet-500 dark:ring-violet-400" : "bg-violet-100 dark:bg-violet-900/40 hover:bg-violet-200 dark:hover:bg-violet-800/40"
              return (
                <div
                  key={gi}
                  {...ttPoint(drug.eventId)}
                  draggable
                  title={`${displayDrugName(drug.name)}${drug.dose ? " — " + drug.dose + " " + drug.unit : ""}`}
                  onDragStart={e => {
                    e.stopPropagation()
                    e.dataTransfer.setData("item-type", "move-drug")
                    e.dataTransfer.setData("item-idx", String(gi))
                    e.dataTransfer.effectAllowed = "move"
                  }}
                  onPointerDown={e => { lastPointer.current = e.pointerType }}
                  onClick={e => {
                    e.stopPropagation()
                    const rect = e.currentTarget.getBoundingClientRect()
                    // 10.8.0: Repeat dose / Edit / Move / Delete. Another drug is added from the cell's "+".
                    if (drug.eventId && menu?.openPoint({ eventId: drug.eventId, rect, title: `${displayDrugName(drug.name)}${drug.dose ? ` ${drug.dose} ${drug.unit}` : ""}` })) return
                    if (lastPointer.current === "touch" || lastPointer.current === "pen") onEditDose(gi, drug.dose, drug.unit, rect)
                    else onOpenPicker(ci, rect)
                  }}
                  className={`relative flex items-start gap-1 rounded px-1.5 py-1 group cursor-grab active:cursor-grabbing transition-colors ${drug.planned ? `opacity-50 border border-dashed ${chip ? "" : "border-violet-400"}` : ""} ${tone}`}
                  style={chip?.style}
                >
                  <SaveMark eventIds={[drug.eventId]} />
                  <span className={`text-xs font-semibold leading-tight min-w-0 flex-1 ${chip ? "" : "text-violet-800 dark:text-violet-300"}`}>
                    {/* The name gives way (ellipsis); the dose is what is read at a glance and is never cut. */}
                    <span className="block truncate">{displayDrugName(drug.name)}</span>
                    {drug.dose && <span className="block whitespace-nowrap font-normal font-mono text-xs tracking-tighter opacity-90">{drug.dose} {drug.unit}</span>}
                  </span>
                </div>
              )
            })}
            <button
              type="button"
              tabIndex={-1}
              data-testid="add-drug"
              data-now={ci === (menu?.facts.nowCol ?? null) ? "" : undefined}
              data-tt-direct
              onClick={e => onOpenPicker(ci, (e.currentTarget as HTMLElement).getBoundingClientRect())}
              className="tt-add w-full mt-1 flex min-h-9 items-center justify-center gap-0.5 text-xs font-semibold rounded border border-dashed border-violet-300 dark:border-violet-700 text-violet-500 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
