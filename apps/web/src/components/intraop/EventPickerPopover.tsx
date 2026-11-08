"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { eventSearchScore } from "@lospor/core/event-synonyms"
import { successionAutomationId } from "@lospor/core/event-succession"
import { useIntraopUiCopy } from "./ui-copy"
import { useEventSelector } from "./event-selector-context"
import { OverflowCueScroll } from "@/components/ui/OverflowCueScroll"

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
 * Search matches the English label, the clinician's own language, and the words colleagues use in both (low bp, desat,
 * кървене), so a Bulgarian user typing Bulgarian finds the same entry an English user does.
 *
 * Two looks (10.2.0, chosen in Settings): the new list (Smart), one quiet list with the likely next events and the
 * categories one open at a time, or the coloured buttons as they were (Legacy).
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
  onToggleEvent: (event: EventOption, category: EventCategory, alreadyRecorded: boolean, suggestion?: string) => void
  onDismiss: () => void
  /** A shock at this column (10.1.0), with its label. */
  defibrillation?: { label: string; onOpen: () => void }
}

const POPOVER_WIDTH = 320

export function EventPickerPopover({
  anchor,
  search,
  categories,
  recordedLabels,
  labels,
  onSearchChange,
  onToggleEvent,
  onDismiss,
  defibrillation,
}: EventPickerPopoverProps) {
  const copy = useIntraopUiCopy()
  const t = useTranslations("intraop.eventsSmart")
  const { screen, likely, dismiss } = useEventSelector()
  const [open, setOpen] = useState("")
  const [openSystem, setOpenSystem] = useState("")
  if (typeof document === "undefined") return null

  const showAbove = window.innerHeight - anchor.bottom < 340
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - POPOVER_WIDTH - 8))
  const top = showAbove ? anchor.top - 4 : anchor.bottom + 4
  // The list scrolls inside the room the page has; the defibrillation button below it stays on screen.
  const room = Math.max(180, (showAbove ? anchor.top : window.innerHeight - anchor.bottom) - 120)

  const query = search.trim()
  const scoreOf = (event: EventOption) => eventSearchScore(query, event.label, [event.displayLabel])
  const visibleCategories = query
    ? categories
      .map(category => ({ ...category, events: category.events.filter(event => scoreOf(event) != null) }))
      .filter(category => category.events.length > 0)
    : categories

  // The new list: the common complications are the first complication category, the systems follow it.
  const firstComplication = categories.findIndex(category => category.isComplication)
  const isSystem = (category: EventCategory, index: number) => category.isComplication && index !== firstComplication
  const mainCategories = categories.filter((category, index) => !isSystem(category, index))
  const systems = categories.filter((category, index) => isSystem(category, index))
  const found = query
    ? categories.flatMap(category => category.events.flatMap(event => { const score = scoreOf(event); return score == null ? [] : [{ event, category, score }] }))
      .sort((a, b) => a.score - b.score).slice(0, 12)
    : []
  const likelyRows = likely.flatMap(item => {
    const hit = categories.flatMap(category => category.events.map(event => ({ event, category }))).find(({ event, category }) => event.label === item.event && !category.isComplication)
    return hit ? [{ item, ...hit }] : []
  })
  const row = "flex w-full min-h-11 items-center gap-2.5 border-b border-slate-100 px-3 text-left text-sm dark:border-[#2a2a2a]"
  const eventRow = (event: EventOption, category: EventCategory, indent: string, sub?: string) => {
    const recorded = recordedLabels.has(event.label)
    return (
      <button key={`${category.cat}:${event.label}`} type="button" data-testid={`event-${event.label}`} onClick={() => onToggleEvent(event, category, recorded)} className={`${row} ${indent}`}>
        <span className="h-2 w-2 flex-none rounded-full" style={{ background: category.color }} />
        <span className="min-w-0 flex-1">
          <span className={`block ${recorded ? "font-bold text-emerald-700 dark:text-emerald-300" : ""}`}>{recorded ? "✓ " : ""}{event.displayLabel}</span>
          {sub ? <span className="block text-[11px] text-slate-500">{sub}</span> : null}
        </span>
      </button>
    )
  }

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

        {screen === "smart" ? (
          <OverflowCueScroll
            testId="event-list"
            style={{ maxHeight: Math.min(384, room) }}
            contentClassName="p-2 pb-0"
            startLabel="Scroll event list up"
            endLabel="Scroll event list down"
            edgeClassName="from-white dark:from-[#1e1e1e]"
          >
            {query ? (
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-[#333]">
                {found.length === 0 ? <p data-testid="event-none" className="p-3 text-sm text-slate-500">{t("none")}</p> : found.map(({ event, category }) => eventRow(event, category, "", category.displayCat))}
              </div>
            ) : (
              <>
                {likelyRows.length > 0 ? (
                  <>
                    <p className="mb-1 mt-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t("likely")}</p>
                    <div data-testid="event-likely" className="overflow-hidden rounded-xl border border-slate-200 dark:border-[#333]">
                      {likelyRows.map(({ item, event, category }) => (
                        <div key={item.event} className="flex min-h-12 items-center gap-2 border-b border-slate-100 px-3 py-1.5 last:border-b-0 dark:border-[#2a2a2a]">
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold">{event.displayLabel}</span>
                            <span className="block text-[11.5px] font-semibold text-amber-600 dark:text-amber-400">{t("usually", { from: item.from, percent: Math.round(item.probability * 100) })}</span>
                          </span>
                          <button type="button" data-testid={`likely-dismiss-${item.event}`} aria-label={t("dismiss")} onClick={() => dismiss(successionAutomationId(item.from, item.event))} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-[#2a2a2a]">{t("dismiss")}</button>
                          <button type="button" data-testid={`likely-log-${item.event}`} onClick={() => onToggleEvent(event, category, false, successionAutomationId(item.from, item.event))}
                            className="min-h-11 rounded-xl border border-violet-500 bg-violet-50 px-4 text-sm font-bold text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">{t("log")}</button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
                <p className="mb-1 mt-3 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t("all")}</p>
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-[#333]">
                  {mainCategories.map(category => {
                    const isOpen = open === category.cat
                    const total = category.events.length + (category.isComplication ? systems.reduce((sum, system) => sum + system.events.length, 0) : 0)
                    return (
                      <div key={category.cat}>
                        <button type="button" data-testid={`event-category-${category.cat}`} aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? "" : category.cat); setOpenSystem("") }} className={`${row} font-bold`}>
                          <span className="h-2 w-2 flex-none rounded-full" style={{ background: category.color }} />
                          <span className="flex-1">{category.displayCat}</span>
                          <span className="text-xs font-normal text-slate-500">{total} {isOpen ? "▾" : "▸"}</span>
                        </button>
                        {isOpen ? (
                          <div className="bg-slate-50 dark:bg-[#1b1b1b]">
                            {category.events.map(event => eventRow(event, category, "pl-6"))}
                            {category.isComplication ? systems.map(system => {
                              const systemOpen = openSystem === system.cat
                              return (
                                <div key={system.cat}>
                                  <button type="button" data-testid={`event-system-${system.cat}`} aria-expanded={systemOpen} onClick={() => setOpenSystem(systemOpen ? "" : system.cat)} className={`${row} min-h-12 pl-8 text-[13px] font-semibold`}>
                                    <span className="flex-1">{system.displayCat}</span>
                                    <span className="text-xs font-normal text-slate-500">{system.events.length} {systemOpen ? "▾" : "▸"}</span>
                                  </button>
                                  {systemOpen ? system.events.map(event => eventRow(event, system, "pl-12")) : null}
                                </div>
                              )
                            }) : null}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
            {defibrillation && (
              <div className="mt-2 border-t border-slate-100 p-2 dark:border-[#2a2a2a]">
                <button type="button" data-testid="event-picker-defibrillation" onClick={defibrillation.onOpen}
                  className="w-full rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  {defibrillation.label}
                </button>
              </div>
            )}
            <div className="h-2" />
          </OverflowCueScroll>
        ) : (
        <OverflowCueScroll
          style={{ maxHeight: "18rem" }}
          contentClassName="p-2 space-y-2.5"
          testId="event-legacy-list"
          startLabel="Scroll event list up"
          endLabel="Scroll event list down"
          edgeClassName="from-white dark:from-[#1e1e1e]"
        >
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

          {defibrillation && (
            <button type="button" data-testid="event-picker-defibrillation" onClick={defibrillation.onOpen}
              className="w-full rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              {defibrillation.label}
            </button>
          )}

          {visibleCategories.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-[#666] text-center py-4">{copy.eventPicker.none}</p>
          )}
        </OverflowCueScroll>
        )}
      </div>
    </>,
    document.body,
  )
}
