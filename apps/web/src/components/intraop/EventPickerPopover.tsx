"use client"

import { createPortal } from "react-dom"
import { useIntraopUiCopy } from "./ui-copy"

/**
 * Logging what happened at a moment in the case.
 *
 * Two kinds of thing share this list because they share a question — "what
 * happened just now?" — even though they end up in different places on the
 * record: clinical events go in the event lane, position changes feed the
 * printed record's own position lane.
 *
 * Events toggle rather than accumulate. Tapping one already recorded at this
 * column removes it, which is how a mis-tap at 3am gets undone without hunting
 * for a delete control.
 *
 * Search matches both the English label and the clinician's own language, so a
 * Bulgarian user typing Bulgarian finds the same entry an English user does.
 */

export type EventOption = {
  label: string
  color: string
  displayLabel: string
}

export type EventCategory = {
  cat: string
  color: string
  displayCat: string
  isComplication: boolean
  events: EventOption[]
}

/**
 * Positions are not events, and this picker no longer offers them.
 *
 * The patient's position is a property of the case, recorded on the
 * intraoperative form's own Position field, which is where mobile has always
 * put it and what the research export reads. Offering it here as well made web
 * and mobile disagree about what the timeline picker is for, and produced a
 * second record of the same fact that nothing on this screen ever drew.
 */
export type EventPickerPopoverProps = {
  anchor: { top: number; bottom: number; left: number; right: number; width: number }
  search: string
  categories: EventCategory[]
  /** Labels already recorded at this column, which tapping again removes. */
  recordedLabels: ReadonlySet<string>
  labels: {
    logClinicalEvent: string
    searchEvents: string
  }
  onSearchChange: (value: string) => void
  onToggleEvent: (event: EventOption, category: EventCategory, alreadyRecorded: boolean) => void
  onDismiss: () => void
}

const POPOVER_WIDTH = 300

function matches(haystacks: string[], query: string) {
  return haystacks.join(" ").toLowerCase().includes(query)
}

export function EventPickerPopover({
  anchor,
  search,
  categories,
  recordedLabels,
  labels,
  onSearchChange,
  onToggleEvent,
  onDismiss,
}: EventPickerPopoverProps) {
  const copy = useIntraopUiCopy()
  if (typeof document === "undefined") return null

  const showAbove = window.innerHeight - anchor.bottom < 340
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - POPOVER_WIDTH - 8))
  const top = showAbove ? anchor.top - 4 : anchor.bottom + 4

  const query = search.toLowerCase().trim()
  const visibleCategories = query
    ? categories
      .map(category => ({
        ...category,
        events: category.events.filter(event => matches([event.label, event.displayLabel], query)),
      }))
      .filter(category => category.events.length > 0)
    : categories

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9990]" onClick={onDismiss} />
      <div
        style={{
          position: "fixed",
          left,
          top,
          width: POPOVER_WIDTH,
          zIndex: 9991,
          transform: showAbove ? "translateY(-100%)" : undefined,
        }}
        className="bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl overflow-hidden"
        onClick={event => event.stopPropagation()}
      >
        <div className="p-2 border-b border-slate-100 dark:border-[#2a2a2a]">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-[#666] px-1 mb-1.5">
            {labels.logClinicalEvent}
          </p>
          <input
            autoFocus
            type="text"
            placeholder={labels.searchEvents}
            value={search}
            onChange={event => onSearchChange(event.target.value)}
            onKeyDown={event => { if (event.key === "Escape") onDismiss() }}
            className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-800 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400"
          />
        </div>

        <div className="max-h-72 overflow-y-auto p-2 space-y-2.5">
          {visibleCategories.map(category => (
            <div key={category.cat}>
              <p className="text-[8px] font-bold uppercase tracking-wider mb-1" style={{ color: category.color }}>
                {category.displayCat}
              </p>
              <div className="flex flex-wrap gap-1">
                {category.events.map(event => {
                  const recorded = recordedLabels.has(event.label)
                  return (
                    <button
                      key={event.label}
                      type="button"
                      onClick={() => onToggleEvent(event, category, recorded)}
                      className="text-xs font-medium px-2 py-0.5 rounded-full border cursor-pointer transition-all hover:opacity-80"
                      style={{
                        backgroundColor: recorded ? event.color : `${event.color}18`,
                        borderColor: `${event.color}88`,
                        color: recorded ? "white" : event.color,
                      }}
                    >
                      {recorded && <span className="mr-0.5">✓</span>}
                      {event.displayLabel}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {visibleCategories.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-[#666] text-center py-4">{copy.eventPicker.none}</p>
          )}
        </div>
      </div>
    </>,
    document.body,
  )
}
