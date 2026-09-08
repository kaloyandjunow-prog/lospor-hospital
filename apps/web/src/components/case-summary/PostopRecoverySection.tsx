import type { ReactElement } from "react"

import type { CaseDetail } from "@/types/case-detail"
import { displayClinicalCode } from "@/lib/clinical-display"

/**
 * The recovery half of the printed record: Aldrete, recovery observations and
 * the handover list.
 *
 * A section of its own because it is one clinical unit — what happened after
 * the patient left theatre — read by whoever takes them next, and because
 * `CaseSummary` is under a size budget the build enforces. Nothing here
 * decides anything; the Aldrete banding is computed by the caller, which is
 * also where the thresholds that define it live.
 */
export function PostopRecoverySection({
  postop: o,
  labels: L,
  aldreteBg,
  aldreteStatus,
  handoverItems,
  handoverLookup,
  Field: F,
  locale,
}: {
  postop: CaseDetail["postop"]
  labels: Record<string, string>
  locale: string
  /** Background classes for the total, banded by the caller. */
  aldreteBg: string
  aldreteStatus: string | null
  handoverItems: string[]
  handoverLookup: Record<string, string>
  Field: (props: { label: string; value: string | null }) => ReactElement | null
}) {
  return (
    <>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[9px] font-bold tracking-[0.12em] text-blue-900 dark:text-blue-300">{L.postopRecoveryLbl}</span>
          <div className="flex-1 h-px bg-blue-100 dark:bg-blue-900/60" />
        </div>
        <div className="grid grid-cols-6 gap-2">
          {[
            ["Activity",      o?.aldreteActivity],
            ["Respiration",   o?.aldreteRespiration],
            ["Circulation",   o?.aldreteCirculation],
            ["Consciousness", o?.aldreteConsciousness],
            ["SpO₂",          o?.aldreteSpO2],
          ].map(([lbl, val]) => (
            <div key={lbl as string} className="border border-slate-200 rounded-lg text-center py-1.5 bg-white">
              <p className="text-[8px] text-slate-500">{lbl as string}</p>
              <p className="text-[15px] font-extrabold text-slate-900 leading-tight">{val ?? "—"}</p>
            </div>
          ))}
          <div className={`border rounded-lg text-center py-1.5 ${aldreteBg}`}>
            <p className="text-[8px] font-medium">{L.aldreteTotalLbl}</p>
            <p className="text-[15px] font-extrabold leading-tight">{o?.aldreteTotal ?? "—"} / 10</p>
            <p className="text-[7px]">{aldreteStatus === "ready" ? L.readyDischarge : aldreteStatus === "observe" ? L.monitor : aldreteStatus === "not_ready" ? L.continueStr : "—"}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 flex-1 min-h-0">
          <div className="border border-slate-200 rounded-lg p-2 bg-white">
            <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1">{L.recoveryObs.toUpperCase()}</p>
            <F label={L.bp} value={o?.recoveryBpSystolic != null && o?.recoveryBpDiastolic != null ? `${o.recoveryBpSystolic} / ${o.recoveryBpDiastolic} mmHg` : null} />
            <F label={L.hr} value={o?.recoveryHeartRate != null ? `${o.recoveryHeartRate} bpm` : null} />
            <F label="SpO₂" value={o?.recoverySpO2 != null ? `${o.recoverySpO2} %` : null} />
            <F label={L.temperature} value={o?.temperatureCelsius ? `${o.temperatureCelsius} °C` : null} />
            <F label={L.painNRS}     value={o?.painScoreNRS != null ? `${o.painScoreNRS} / 10` : null} />
            <F label={L.ponv}        value={o?.ponv ? "Yes" : o?.ponv === false ? "None" : null} />
          </div>
          <div className="border border-slate-200 rounded-lg p-2 bg-white">
            <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1.5">{L.disposition.toUpperCase()}</p>
            {o?.disposition && (
              <span className={`inline-block text-[11px] font-extrabold px-3 py-0.5 rounded-md border mb-1.5 ${
                o.disposition === "WARD" ? "bg-green-100 text-green-800 border-green-300" :
                o.disposition === "PACU" ? "bg-amber-100 text-amber-800 border-amber-300" :
                "bg-red-100 text-red-800 border-red-300"
              }`}>{displayClinicalCode("option:DISPOSITION", o.disposition, locale)}</span>
            )}
            {o?.dispositionNotes && <p className="text-[9.5px] text-slate-700 leading-snug">{o.dispositionNotes}</p>}
          </div>
          <div className="border border-slate-200 rounded-lg p-2 bg-white">
            <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1.5">{L.handover.toUpperCase()}</p>
            <div className="flex flex-wrap gap-1">
              {handoverItems.length > 0 ? handoverItems.map((code: string, idx: number) => (
                <span key={idx} className="text-[8.5px] text-green-800 bg-green-50 border border-green-200 rounded px-1.5 py-[1.5px]">
                  ✓ {handoverLookup[code] ?? code.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                </span>
              )) : <p className="text-[9px] text-slate-400">—</p>}
            </div>
          </div>
        </div>
    </>
  )
}
