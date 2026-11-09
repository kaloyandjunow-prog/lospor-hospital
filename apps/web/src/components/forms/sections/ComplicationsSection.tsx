"use client"
import { Controller, type Control, type UseFormWatch } from "react-hook-form"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import { Textarea } from "@/components/ui/textarea"
import {
  intraopComplicationList,
  legacyComplications,
  withLegacyComplicationNotes,
  withoutLegacyComplication,
} from "@lospor/core/complication-events"
import { clinicalDisplayLabel } from "@lospor/core/display"
import { isChartedIntraopEvent } from "@lospor/core/intraop-summary"
import type { LogEvent } from "@lospor/core/intraop-types"
import type { IntraopFormFields } from "@/components/forms/IntraopForm"
import type { IntraopLogEvent } from "@/components/IntraopTimetable"
import { useLocale } from "next-intl"
import { describeIntraopEvent } from "@lospor/core/intraop-summary"
import { resolveIntraopEventLabel } from "@lospor/core/clinical-display"
import { groupLabsByDraw, labDrawSummary, type LabResult } from "@lospor/core/labs"
import { EventLogTimelineStream } from "@/components/forms/sections/EventLogTimelineStream"

export function ComplicationsSection({ t, control, watch, eventLog, labResults = [], onDeleteEvent, eventLogScreen = "smart" }: {
  t: (key: string) => string
  control: Control<IntraopFormFields>
  watch: UseFormWatch<IntraopFormFields>
  eventLog?: IntraopLogEvent[]
  /** Lab draws are listed with the events by time, though they are not events. */
  labResults?: LabResult[]
  onDeleteEvent?: (id: string) => void
  eventLogScreen?: "smart" | "legacy"
}) {
  const locale = useLocale()
  const draws = groupLabsByDraw(labResults).filter(draw => draw.takenAt)
  const entries = [
    // A "Not now" to a question from the vitals is not something that happened (10.1.0).
    ...(eventLog ?? []).filter(isChartedIntraopEvent).map(ev => ({ kind: "event" as const, ts: ev.ts ?? "", ev })),
    ...draws.map(draw => ({ kind: "lab" as const, ts: draw.takenAt!, draw })),
  ].sort((a, b) => new Date(a.ts || 0).getTime() - new Date(b.ts || 0).getTime())
  const hhmmOf = (ts: string) => { const d = new Date(ts || 0); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}` }
  // One list from the timed entries and the old text's items (10.1.0): added
  // only from the chart, deleted here -- which deletes the entry everywhere.
  const language = locale === "bg" ? "bg" : "en"
  const complicationWhen = (item: ReturnType<typeof intraopComplicationList>[number]) => !item.ts
    ? t("intraop.complicationNoTime")
    : item.endTs && item.endTs !== item.ts ? `${hhmmOf(item.ts)}–${hhmmOf(item.endTs)}`
    : item.open ? `${hhmmOf(item.ts)} · ${t("intraop.complicationOpen")}` : hhmmOf(item.ts)
  return (
    <SectionCard title={t("intraop.complicationsSummaryTitle")} collapsible defaultCollapsed
      badge={watch("complications") ? t("intraop.documented") : undefined}>
      <Controller name="complications" control={control} render={({ field }) => (
        <div className="space-y-3">
          <ul className="space-y-1" data-testid="complications-list">
            {intraopComplicationList((eventLog ?? []) as LogEvent[], field.value).map(item => (
              <li key={item.key} data-testid={`complication-${item.key}`} className="flex items-center gap-2 text-sm border-b border-slate-50 dark:border-[#1e1e1e] py-1">
                <span className="w-0.5 h-5 rounded-full bg-red-500 shrink-0" />
                <span className="flex-1 font-medium text-red-700 dark:text-red-300">{clinicalDisplayLabel("complication", item.label, language, { label: item.label })}</span>
                <span className="text-xs tabular-nums text-slate-500">{complicationWhen(item)}</span>
                {(item.eventId ? !!onDeleteEvent : true) && (
                  <button type="button" data-testid={`complication-delete-${item.key}`} aria-label={t("intraop.deleteEvent")} title={t("intraop.deleteEvent")}
                    onClick={() => item.eventId
                      ? onDeleteEvent?.(item.eventId)
                      // Core reads both the web's "A; B; notes" and the PWA's "A; B — notes".
                      : field.onChange(withoutLegacyComplication(field.value, item.label) ?? "")}
                    className="text-slate-400 hover:text-red-500 text-sm px-1">x</button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">{t("intraop.complicationsTimedHint")}</p>
          <Textarea
            placeholder={t("intraop.complicationsNotesPlaceholder")}
            value={legacyComplications(field.value).notes}
            onChange={e => field.onChange(withLegacyComplicationNotes(field.value, e.target.value.trim()) ?? "")}
            maxLength={500}
            className="text-sm"
            rows={2}
          />
        </div>
      )} />

      {/* Legacy event log (read-only timeline) */}
      {eventLogScreen !== "smart" && entries.length > 0 && (
        <div className="mt-5 border-t border-slate-100 dark:border-[#2a2a2a] pt-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-[#666] mb-3">{t("intraop.eventLog")}</p>
          <div className="space-y-0">
            {entries.map((entry) => {
              if (entry.kind === "lab") {
                return (
                  <div key={`lab-${entry.ts}`} data-testid="event-log-lab-draw" className="flex items-center gap-2.5 py-1.5 border-b border-slate-50 dark:border-[#1e1e1e] last:border-0">
                    <span className="text-[11px] text-slate-400 dark:text-[#666] tabular-nums pt-0.5 w-10 shrink-0">{hhmmOf(entry.ts)}</span>
                    <div className="w-0.5 h-5 rounded-full shrink-0 bg-teal-500" />
                    <span className="text-[12px] text-slate-700 dark:text-slate-300 font-medium leading-snug flex-1">
                      {t("intraop.timetable.labs")} · {entry.draw.results.length}
                      <span className="block text-[11px] font-normal text-slate-400">{labDrawSummary(entry.draw)}</span>
                    </span>
                  </div>
                )
              }
              const ev = entry.ev
              const hhmm = hhmmOf(entry.ts)
              // The log in the reader’s language: fixed words from core, a clinical
              // event by its catalogue name (saved in English), as the PWA does.
              const described = describeIntraopEvent(ev, { language: locale })
              const descriptor = ev.type === "clinical_event" ? { ...described, text: resolveIntraopEventLabel(described.text, locale === "bg" ? "bg" : "en") } : described
              // Auto-filled vitals are copies, not readings: the log says so.
              const text = ev.autoFilled ? `${descriptor.text} · ${t("intraop.timelineRules.autoFilledTag")}` : descriptor.text
              const { color } = descriptor
              return (
                <div key={ev.id} className="flex items-center gap-2.5 py-1.5 border-b border-slate-50 dark:border-[#1e1e1e] last:border-0 group">
                  <span className="text-[11px] text-slate-400 dark:text-[#666] tabular-nums pt-0.5 w-10 shrink-0">{hhmm}</span>
                  <div className="w-0.5 h-5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[12px] text-slate-700 dark:text-slate-300 font-medium leading-snug flex-1">{text}</span>
                  {onDeleteEvent && (
                    <button
                      type="button"
                      onClick={() => ev.id && onDeleteEvent(ev.id)}
                      className="opacity-40 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 text-sm leading-none px-1 py-0.5 rounded"
                      title={t("intraop.deleteEvent")}
                      aria-label={t("intraop.deleteEvent")}
                    >{t("intraop.deleteEvent")}</button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {eventLogScreen === "smart" && <EventLogTimelineStream t={t} eventLog={eventLog} labResults={labResults} onDeleteEvent={onDeleteEvent} />}
    </SectionCard>
  )
}
