"use client"

import { useMemo, useState } from "react"
import { intraopComplicationList } from "@lospor/core/complication-events"
import { isChartedIntraopEvent, describeIntraopEvent } from "@lospor/core/intraop-summary"
import type { LogEvent } from "@lospor/core/intraop-types"
import { resolveIntraopEventLabel } from "@lospor/core/clinical-display"
import { groupLabsByDraw, labDrawSummary, type LabResult } from "@lospor/core/labs"
import type { IntraopLogEvent } from "@/components/IntraopTimetable"
import { useLocale } from "next-intl"

type Filter = "all" | "vitals" | "events" | "labs" | "complications"
const FILTERS: readonly Filter[] = ["all", "vitals", "events", "labs", "complications"]

export function EventLogTimelineStream({ t, eventLog = [], labResults = [], onDeleteEvent }: {
  t: (key: string, values?: Record<string, string | number>) => string
  eventLog?: IntraopLogEvent[]
  labResults?: LabResult[]
  onDeleteEvent?: (id: string) => void
}) {
  const locale = useLocale()
  const [filter, setFilter] = useState<Filter>("all")
  const draws = useMemo(() => groupLabsByDraw(labResults).filter(draw => draw.takenAt), [labResults])
  const log = useMemo(() => eventLog.filter(isChartedIntraopEvent) as LogEvent[], [eventLog])
  const complicationIds = useMemo(() => new Set(intraopComplicationList(log, "").flatMap(item => item.eventId ? [item.eventId] : [])), [log])
  const entries = useMemo(() => [
    ...log.map(ev => ({ kind: "event" as const, ts: ev.ts ?? "", ev })),
    ...draws.map(draw => ({ kind: "lab" as const, ts: draw.takenAt!, draw })),
  ].sort((a, b) => new Date(a.ts || 0).getTime() - new Date(b.ts || 0).getTime()).filter(entry => matches(entry, filter, complicationIds)), [complicationIds, draws, filter, log])
  return (
    <div className="mt-5 border-t border-slate-100 dark:border-[#2a2a2a] pt-4" data-testid="event-log-timeline-stream">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {FILTERS.map(option => <button key={option} type="button" data-testid={`event-log-filter-${option}`} aria-pressed={filter === option} onClick={() => setFilter(option)} className={`rounded-full border px-2.5 py-1.5 text-[10px] font-bold ${filter === option ? "border-sky-700 bg-sky-950/40 text-sky-300" : "border-slate-200 text-slate-500 dark:border-[#333]"}`}>{t(`intraop.eventLogFilter${option[0].toUpperCase()}${option.slice(1)}`)}</button>)}
      </div>
      <p className="text-[10px] text-slate-400 dark:text-[#666] mb-3">{t("intraop.eventLogShowing", { count: entries.length })}</p>
      <div className="space-y-0">
        {entries.length === 0 && <p className="py-5 text-sm text-slate-500">{t("intraop.noEventsYet")}</p>}
        {entries.map(entry => {
          if (entry.kind === "lab") return <div key={`lab-${entry.ts}`} data-testid="event-log-lab-draw" className="flex items-center gap-2.5 py-1.5 border-b border-slate-50 dark:border-[#1e1e1e] last:border-0"><span className="text-[11px] text-slate-400 dark:text-[#666] tabular-nums pt-0.5 w-10 shrink-0">{hhmmOf(entry.ts)}</span><div className="w-0.5 h-5 rounded-full shrink-0 bg-teal-500" /><span className="text-[12px] text-slate-700 dark:text-slate-300 font-medium leading-snug flex-1">{t("intraop.timetable.labs")} · {entry.draw.results.length}<span className="block text-[11px] font-normal text-slate-400">{labDrawSummary(entry.draw)}</span></span></div>
          const described = describeIntraopEvent(entry.ev, { language: locale })
          const descriptor = entry.ev.type === "clinical_event" ? { ...described, text: resolveIntraopEventLabel(described.text, locale === "bg" ? "bg" : "en") } : described
          const tagged = entry.ev.autoFilled ? `${descriptor.text} · ${t("intraop.timelineRules.autoFilledTag")}` : descriptor.text
          // A dose tapped during an arrest and spread across it afterwards: its time is approximate.
          const text = entry.ev.timeApproximate ? `${tagged} · ${t("intraop.timelineRules.approximateTimeTag")}` : tagged
          return <div key={entry.ev.id} className="flex items-center gap-2.5 py-1.5 border-b border-slate-50 dark:border-[#1e1e1e] last:border-0 group"><span className="text-[11px] text-slate-400 dark:text-[#666] tabular-nums pt-0.5 w-10 shrink-0" data-testid={entry.ev.timeApproximate ? "event-log-time-approximate" : undefined}>{entry.ev.timeApproximate ? "≈" : ""}{hhmmOf(entry.ts)}</span><div className="w-0.5 h-5 rounded-full shrink-0" style={{ backgroundColor: descriptor.color }} /><span className="text-[12px] text-slate-700 dark:text-slate-300 font-medium leading-snug flex-1">{text}</span>{onDeleteEvent && <button type="button" onClick={() => onDeleteEvent(entry.ev.id)} className="opacity-60 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-red-500 text-[11px] font-semibold leading-none px-2 py-1.5 rounded" title={t("intraop.deleteEvent")} aria-label={t("intraop.deleteEvent")}>{t("intraop.deleteEvent")}</button>}</div>
        })}
      </div>
    </div>
  )
}

function matches(entry: { kind: "event"; ev: LogEvent } | { kind: "lab"; draw: unknown }, filter: Filter, complicationIds: Set<string>) {
  if (filter === "all") return true
  if (entry.kind === "lab") return filter === "labs"
  if (filter === "vitals") return entry.ev.type === "vital"
  if (filter === "complications") return complicationIds.has(entry.ev.id)
  return filter === "events" && entry.ev.type !== "vital"
}

function hhmmOf(ts: string) { const d = new Date(ts || 0); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` }
