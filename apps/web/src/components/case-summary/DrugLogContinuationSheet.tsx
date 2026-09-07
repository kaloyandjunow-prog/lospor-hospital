import { format } from "date-fns"

import { displayClinicalCode } from "@/lib/clinical-display"

type DrugLogEntry = {
  n: number
  time: string
  name: string
  dose: string
  color: string
}

/**
 * A sheet carrying the part of the drug log that would not fit on sheet 1.
 *
 * Separate from the timetable's continuation sheets, which exist only for
 * cases past about a day: a three-hour case with frequent boluses overruns the
 * log panel without ever needing a second chart, so the two cannot share a
 * trigger.
 *
 * Its own file because `CaseSummary` is under a size budget the build enforces,
 * and page furniture is the easiest thing in that component to lift out without
 * moving any decision with it.
 */
export function DrugLogContinuationSheet({
  entries,
  labels,
  locale,
  patientLine,
  caseCode,
  continuedWord,
  /** Where this sheet sits in the printed set, counting from one. */
  sheetNumber,
  /** How many sheets there are in total, for the "of" in the footer. */
  sheetCount,
  /** True when another drug-log sheet follows this one. */
  hasNext,
  /** The sheet number of the one that follows, when there is one. */
  nextSheetNumber,
}: {
  entries: DrugLogEntry[]
  labels: { drugLog: string; footerLine: string; generatedLbl: string; record: string }
  locale: string
  patientLine: string
  caseCode?: string | null
  continuedWord: string
  sheetNumber: number
  sheetCount: number
  hasNext: boolean
  nextSheetNumber: number
}) {
  const L = labels
  return (
        <div className="page-intraop border border-slate-200 rounded-xl bg-white p-3 flex flex-col gap-2 min-h-[520px]">
          <div className="flex items-center justify-between border-b-2 border-blue-900 dark:border-blue-500 pb-1.5 gap-3">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-[13px] font-black tracking-tight text-slate-900">LOSPOR</span>
              <span className="text-[9.5px] font-bold tracking-[0.14em] text-blue-900 dark:text-blue-300">{L.drugLog.toUpperCase()} · {continuedWord}</span>
              <span className="text-[9px] text-slate-500 truncate">
                {[patientLine,
                  locale === "bg" ? "самоличността — на лист 1" : "identity fields on Sheet 1",
                ].filter(Boolean).join(" · ")}
              </span>
            </div>
            <div className="text-right text-[9px] text-slate-500 shrink-0">
              <span className="font-bold text-slate-800">{entries[0].time} – {entries[entries.length - 1].time}</span>
              {" · "}{caseCode ? `Case ${caseCode} · ` : ""}
              {locale === "bg"
                ? `Стр. ${sheetNumber} от ${sheetCount}`
                : `Page ${sheetNumber} of ${sheetCount}`}
            </div>
          </div>

          {/* Four columns rather than sheet 1's two: this page has nothing
            * else on it, so the entries can be narrower and there can be
            * far more of them before another sheet is needed. */}
          <div className="border border-slate-200 rounded-lg bg-white flex-1 min-h-0 overflow-hidden p-2">
            <div className="grid grid-cols-4 gap-x-3">
              {entries.map(d => (
                <div key={d.n} className="flex items-center gap-1.5 text-[8.5px] leading-[12px] min-w-0">
                  <span className="inline-flex items-center justify-center w-[11px] h-[11px] rounded-full border text-[6.8px] font-bold shrink-0"
                    style={{ color: d.color, borderColor: d.color }}>{d.n}</span>
                  <span className="font-bold text-slate-500 text-[8px]" style={{ fontFamily: "Consolas, monospace" }}>{d.time}</span>
                  <span className="text-slate-700 truncate flex-1">{displayClinicalCode("option:INTRAOP_DRUG", d.name, locale, { label: d.name })}</span>
                  <span className="font-bold text-slate-900 whitespace-nowrap" style={{ fontFamily: "Consolas, monospace" }}>{d.dose}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between text-[7.5px] text-slate-400 border-t border-slate-200 pt-1">
            <span>{L.footerLine}</span>
            <span>{hasNext
              ? (locale === "bg" ? `Продължава на лист ${nextSheetNumber} · ` : `Continues on Sheet ${nextSheetNumber} · `)
              : ""}{L.generatedLbl} {format(new Date(), "dd MMM yyyy")}</span>
          </div>
        </div>
  )
}
