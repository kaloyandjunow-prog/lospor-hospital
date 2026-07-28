"use client"
import { Controller, type Control, type UseFormWatch } from "react-hook-form"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import { Textarea } from "@/components/ui/textarea"
import { ComplicationsPicker, ALL_COMPLICATIONS } from "@/components/intraop/ComplicationsPicker"
import type { IntraopFormFields } from "@/components/forms/IntraopForm"
import type { IntraopLogEvent } from "@/components/IntraopTimetable"
import { describeIntraopEvent } from "@lospor/core/intraop-summary"

export function ComplicationsSection({ t, control, watch, eventLog, onDeleteEvent }: {
  t: (key: string) => string
  control: Control<IntraopFormFields>
  watch: UseFormWatch<IntraopFormFields>
  eventLog?: IntraopLogEvent[]
  onDeleteEvent?: (id: string) => void
}) {
  return (
    <SectionCard title={t("intraop.complicationsSection")} collapsible defaultCollapsed
      badge={watch("complications") ? "Documented" : undefined}>
      <Controller name="complications" control={control} render={({ field }) => (
        <div className="space-y-3">
          <ComplicationsPicker value={field.value} onChange={field.onChange} />
          <Textarea
            placeholder="No patient-identifying information - additional notes..."
            value={
              field.value
                ? field.value.split(";").map((s: string) => s.trim()).filter((s: string) => s && !ALL_COMPLICATIONS.includes(s)).join("; ")
                : ""
            }
            onChange={e => {
              const structured = field.value
                ? field.value.split(";").map((s: string) => s.trim()).filter((s: string) => ALL_COMPLICATIONS.includes(s))
                : []
              const combined = [...structured, ...(e.target.value.trim() ? [e.target.value.trim()] : [])].join("; ")
              field.onChange(combined)
            }}
            maxLength={500}
            className="text-sm"
            rows={2}
          />
        </div>
      )} />

      {/* Mobile event log (read-only timeline) */}
      {eventLog && eventLog.length > 0 && (
        <div className="mt-5 border-t border-slate-100 dark:border-[#2a2a2a] pt-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-[#666] mb-3">Event log</p>
          <div className="space-y-0">
            {[...eventLog].sort((a, b) => new Date(a.ts ?? 0).getTime() - new Date(b.ts ?? 0).getTime()).map((ev) => {
              const hhmm = (() => { const d = new Date(ev.ts ?? 0); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}` })()
              const descriptor = describeIntraopEvent(ev)
              const { text, color } = descriptor
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
                      title="Delete event"
                    >x</button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </SectionCard>
  )
}
