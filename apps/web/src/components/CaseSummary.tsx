"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { apfelRiskLabel, rcriRiskLabel, stopBangRiskLabel } from "@/lib/scores"
import { useLocale } from "next-intl"
import { aldreteBand, handoverGroups } from "@lospor/core/postop"
import { INTRAOP_COLUMN_MINUTES } from "@lospor/core/intraop-engine"
import { displayClinicalCode, displayOptionEntry } from "@/lib/clinical-display"
import type { Tag } from "@/components/TagInput"
import type { CaseDetail, CaseDetailIntraop } from "@/types/case-detail"
import { FINALIZE_UNDO_WINDOW_MS } from "@/lib/constants"
import { PrintTimetable, calcDrugTotals, calcInfTotals, naturalMaxCols, buildDrugLog } from "@/components/case-summary/PrintTimetable"
import { LABELS } from "@/components/case-summary/labels"
import { ReviewBar } from "@/components/case-summary/ReviewBar"
import { caseIsWritable } from "@/lib/case-capabilities"
import { planPanels, type PanelPlan } from "@lospor/core/print"

/**
 * BMI to one decimal, for display only.
 *
 * The stored value is deliberately full precision — this is a research database,
 * and averaging precisely-stored BMIs beats averaging pre-rounded ones
 * (`lospor-api` `_mappers.ts`, pinned to four decimal places by
 * `pediatric-mappers.test.ts`). So the rounding has to happen here.
 *
 * Without it the anaesthesia record printed "BMI 26.1224489795918" — 80 kg at
 * 175 cm — on a sheet that goes in the patient's notes.
 */
function formatBmi(bmi: number): string {
  return String(Math.round(bmi * 10) / 10)
}
import { colToHHMM as sharedColToHHMM } from "@lospor/core/summary-timetable"
import { resolveIdealBodyWeight } from "@lospor/core/ideal-body-weight"

// ── Enum label maps ───────────────────────────────────────────────────────────
function deviceLabel(i: CaseDetailIntraop | null | undefined, locale: string): string {
  const devices: string[] = Array.isArray(i?.airwayDevices) ? i.airwayDevices : []
  const cuffedSuffix = (cuffed: boolean | null | undefined) => cuffed == null
    ? ""
    : ` ${displayClinicalCode("clinicalAttribute", cuffed ? "cuffed" : "uncuffed", locale)}`

  return devices.map(device => {
    const label = displayClinicalCode("option:AIRWAY_MANAGEMENT", device, locale)
    if (device === "ORAL_ETT") return `${label}${i?.oralTubeSize ? " " + i.oralTubeSize + "mm" : ""}${cuffedSuffix(i?.oralCuffed)}`
    if (device === "NASAL_ETT") return `${label}${i?.nasalTubeSize ? " " + i.nasalTubeSize + "mm" : ""}${cuffedSuffix(i?.nasalCuffed)}`
    if (device === "LMA") return `${label}${i?.lmaSize ? " " + i.lmaSize : ""}`
    if (device === "DOUBLE_LUMEN_TUBE") return `${label}${i?.dltType ? " " + i.dltType : ""}${i?.dltSide ? " " + displayClinicalCode("clinicalAttribute", i.dltSide.toLowerCase(), locale, { label: i.dltSide }) : ""}${i?.dltSize ? " " + i.dltSize + "Fr" : ""}`
    if (device === "ENDOBRONCHIAL_TUBE") return `${label}${i?.endobronchialSize ? " " + i.endobronchialSize + "mm" : ""}`
    return label
  }).join(" + ") || "—"
}

const MON: { f: keyof CaseDetailIntraop; l: string }[] = [
  { f: "ecg",              l: "ECG"      },
  { f: "spO2Monitor",      l: "SpO₂"     },
  { f: "nbpMonitor",       l: "NBP"      },
  { f: "etco2Monitor",     l: "EtCO₂"    },
  { f: "tempMonitor",      l: "Temp"     },
  { f: "invasiveBP",       l: "IBP"      },
  { f: "cvpMonitor",       l: "CVP"      },
  { f: "paCatheter",       l: "PA cath"  },
  { f: "tee",              l: "TEE"      },
  { f: "bis",              l: "BIS"      },
  { f: "entropyMonitor",   l: "Entropy"  },
  { f: "nirsMonitor",      l: "NIRS"     },
  { f: "evokedPotentials", l: "SSEP/MEP" },
  { f: "tofMonitor",       l: "TOF/NMT"  },
  { f: "bglMonitor",       l: "Serum/peripheral glucose" },
  { f: "bloodGasMonitor",  l: "ABG"      },
  { f: "urinaryCatheter",  l: "Urine"    },
  { f: "stomachTube",      l: "NGT"      },
]

function F({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null
  return (
    <div className="flex justify-between gap-2 py-[2px] border-b border-slate-100 dark:border-[#252525] last:border-0 text-[10.5px]">
      <span className="text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      <span className="font-semibold text-slate-800 dark:text-slate-100 text-right min-w-0 break-words">{String(value)}</span>
    </div>
  )
}

function Chip({ children, color = "slate" }: { children: string; color?: string }) {
  const c: Record<string, string> = {
    slate:  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    blue:   "bg-blue-100  text-blue-800  dark:bg-blue-900/40 dark:text-blue-300",
    amber:  "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    red:    "bg-red-100   text-red-700   dark:bg-red-900/30  dark:text-red-300",
    green:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  }
  return <span className={`inline-block text-[8.5px] px-1.5 py-0.5 rounded font-medium mr-1 mb-1 ${c[color] ?? c.slate}`}>{children}</span>
}

// ── Main Component ────────────────────────────────────────────────────────────
// mode="summary" (default): the live case summary — review bar, continuous
// paper-style content, NO print chrome and NO print buttons (printing moved to
// the dedicated /cases/[id]/print page for finished cases).
// mode="print": the A4 print sheets with page chrome + print CSS, used by the
// print page. `initialData` lets the print page pass a server-fetched case
// (required for the mobile print-token flow, which has no browser session).
export function CaseSummary({ caseId, mode = "summary", initialData }: {
  caseId: string
  mode?: "summary" | "print"
  initialData?: CaseDetail
}) {
  const locale = useLocale()
  const isPrint = mode === "print"
  const L = locale === "bg" ? LABELS.bg : LABELS.en
  const handoverLookup = (() => {
    const groups = handoverGroups(locale === "bg" ? "bg" : "en")
    const map: Record<string, string> = {}
    groups.forEach(g => g.items.forEach(i => { map[i.code] = i.label }))
    return map
  })()

  const [data,       setData]       = useState<CaseDetail | null>(initialData ?? null)
  const [loading,    setLoading]    = useState(!initialData)
  const [now, setNow] = useState<number>(Date.now)

  useEffect(() => {
    if (initialData) return // print-token flow: server already supplied the case
    let cancelled = false
    async function load() {
      // A summary that cannot be loaded must say so. Swallowing the failure
      // left the page pulsing "Loading…" forever, or — worse, on an error
      // response that still parses as JSON — drew a record out of `{error}`
      // with every clinical field silently blank.
      try {
        const res = await fetch(`/api/cases/${caseId}`)
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        const d = await res.json() as CaseDetail | null
        if (!cancelled) { setData(d ?? null); setLoading(false) }
      } catch {
        if (!cancelled) { setData(null); setLoading(false) }
      }
    }
    load()
    const onLive = () => load()
    window.addEventListener("case-live-update", onLive)
    return () => {
      cancelled = true
      window.removeEventListener("case-live-update", onLive)
    }
  }, [caseId, initialData])

  // The undo window closes on its own clock, not on the next navigation: a
  // summary left open past the deadline must stop offering Unfinalize, since
  // the server will refuse it anyway.
  const finalizedAtMs = data?.finalizedAt ? new Date(data.finalizedAt).getTime() : null
  useEffect(() => {
    if (finalizedAtMs == null) return
    const msLeft = finalizedAtMs + FINALIZE_UNDO_WINDOW_MS - Date.now()
    if (msLeft <= 0) return
    const timer = setTimeout(() => setNow(Date.now()), msLeft)
    return () => clearTimeout(timer)
  }, [finalizedAtMs])

  if (loading) return <div className="text-sm text-slate-400 dark:text-slate-500 text-center py-12 animate-pulse">{L.loadingCase}</div>
  if (!data)   return <div className="text-sm text-red-500 text-center py-12">{L.loadFailed}</div>

  // Whether this reader may still write to the case, straight from the API.
  // A creator who handed the case on keeps read and print access and loses
  // write, so offering them Edit or Close Now offers a refusal. Absent or
  // malformed capabilities read as read-only: a missing field must never
  // hand out edit rights, whether the case arrived from the endpoint or as
  // `initialData` on the print-token path.
  const canWrite = caseIsWritable(data)

  const p    = data.preop
  const i    = data.intraop
  const o    = data.postop
  const inst = data.institution
  const ibwResolution = resolveIdealBodyWeight({
    clinicalMode: data.clinicalMode === "PEDIATRIC" ? "PEDIATRIC" : "ADULT",
    heightCm: p?.heightCm,
    sex: p?.sex,
    age: data.clinicalMode === "PEDIATRIC" && p?.ageValue != null && p.ageUnit
      ? { value: p.ageValue, unit: p.ageUnit }
      : null,
  })

  const techniques:    string[] = Array.isArray(i?.techniques)       ? i.techniques       : []
  const positions:     string[] = Array.isArray(i?.positions)        ? i.positions        : []
  const ventModes:     string[] = Array.isArray(i?.ventilationModes) ? i.ventilationModes : []
  const airwayTools:   string[] = Array.isArray(i?.airwayTools)      ? i.airwayTools      : []
  type VascularAccessItem = { site?: string; siteLabel?: string; size?: string; sizeUnit?: string }
  type LabResultItem = { test?: string; value?: string; unit?: string }
  const vascular:      VascularAccessItem[] = Array.isArray(i?.vascularAccesses) ? i.vascularAccesses : []
  const comorbidities: Tag[]                = Array.isArray(p?.comorbidities)    ? p.comorbidities    : []
  const currentMedicationsText = (() => {
    const raw = p?.currentMedications
    if (!raw) return null
    const trimmed = raw.trim()
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown[]
        if (Array.isArray(parsed)) return parsed
          .map((item) => {
            const med = item as { label?: unknown; inn?: unknown; name?: unknown }
            return med.label ?? med.inn ?? med.name
          })
          .filter((label): label is string => typeof label === "string" && label.length > 0)
          .join(", ")
      } catch {}
    }
    return raw
  })()
  const allergyDetailsText = (() => {
    const raw = p?.allergyDetails
    if (!raw) return null
    const trimmed = raw.trim()
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown[]
        if (Array.isArray(parsed)) return parsed
          .map((item) => {
            const med = item as { label?: unknown; name?: unknown }
            return med.label ?? med.name
          })
          .filter((label): label is string => typeof label === "string" && label.length > 0)
          .join(", ")
      } catch {}
    }
    return raw
  })()
  const labResults:    LabResultItem[]      = Array.isArray(p?.labResults)       ? (p.labResults as LabResultItem[]).filter(l => l.value) : []
  const handoverItems: string[] = Array.isArray(o?.handoverItems)    ? o.handoverItems    : []
  const timetable = ((i?.keyEvents && typeof i.keyEvents === "object" && !Array.isArray(i.keyEvents)) ? i.keyEvents : {}) as import("@/types/timetable").LegacyKeyEvents

  // ── Panel planning: stacked half-case charts, paper-record style ───────────
  // ≤~5h: one full-height chart. Longer: TWO stacked panels (first half /
  // second half of the case) on the same sheet — nothing repeats, everything
  // gets twice the horizontal room. Continuation sheets only >~24h.
  const totalCols = naturalMaxCols(timetable)
  const panelPlans = planPanels({ totalCols })
  const sheet0Panels = panelPlans.filter(pl => pl.sheet === 0)
  const contSheets: PanelPlan[][] = []
  for (const pl of panelPlans) {
    if (pl.sheet === 0) continue
    ;(contSheets[pl.sheet - 1] ??= []).push(pl)
  }
  const pageTotal = contSheets.length + 2
  const contWord = locale === "bg" ? "ПРОДЪЛЖЕНИЕ" : "CONTINUED"
  const panelView = (pl: PanelPlan, withCaption: boolean) => ({
    c0: pl.startCol,
    c1: pl.endCol,
    step: Math.max(1, Math.round(pl.intervalMin / INTRAOP_COLUMN_MINUTES)),
    // Time-window caption drawn inside the chart's top-left corner
    caption: withCaption
      ? `${pl.index > 0 ? `${contWord} · ` : ""}${colHHMM(pl.startCol)} – ${colHHMM(pl.endCol + 1)}`
      : undefined,
  })
  // Column → wall-clock label (same UTC convention as the timetable itself)
  const colHHMM = (col: number) => sharedColToHHMM(col, i?.startTime)

  const activeMonitors = MON.filter(m => i?.[m.f]).map(m => displayClinicalCode("option:MONITORING", m.f, locale))
  const dateStr = (() => {
    if (!i?.monthYear) return ""
    const [y, m] = i.monthYear.split("-")
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"]
    return `${months[parseInt(m, 10) - 1] ?? ""} ${y}`
  })()
  const drugTotals     = calcDrugTotals(timetable)
  const infTotals      = calcInfTotals(timetable)
  const drugLog        = buildDrugLog(timetable, i?.startTime)
  const ageSuffix  = locale === "bg" ? "г." : "y"
  const sexLabel   = (s: string) => locale === "bg" ? (s === "MALE" ? "М" : s === "FEMALE" ? "Ж" : "") : (s === "MALE" ? "M" : s === "FEMALE" ? "F" : "")
  // `!= null`, not truthiness: a neonate's age in years is legitimately 0, and
  // the continuation sheet was dropping it.
  const patientLine = [p?.ageYears != null ? `${p.ageYears}${ageSuffix}` : "", p?.sex ? sexLabel(p.sex) : ""].filter(Boolean).join(" · ")

  function duration() {
    if (!i?.startTime || !i?.endTime) return null
    const s = new Date(i.startTime), e = new Date(i.endTime)
    const mins = Math.round((e.getTime() - s.getTime()) / 60000)
    // Stored times are UTC-encoded wall-clock; UTC getters recover the entered
    // time (same convention as the timetable's colToHHMM).
    const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
    return `${hhmm(s)} → ${hhmm(e)} · ${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`
  }

  // A recovery nobody has scored yet is not a zero. Defaulting the missing
  // total to 0 banded every un-assessed patient "not ready" in alarm red — the
  // worst reading on the sheet, produced by the absence of a reading.
  const aldreteStatus = o?.aldreteTotal != null ? aldreteBand(o.aldreteTotal) : null
  const aldreteBg = aldreteStatus === "ready" ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700"
    : aldreteStatus === "observe" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
    : aldreteStatus === "not_ready" ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700"
    : "bg-white dark:bg-[#1a1a1a] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-[#333]"


  return (
    <>
      {/* ── Print styles — print mode only (summary is never printed) ────────── */}
      {isPrint && <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }

          /* Both pages fill the full A4 landscape sheet.
             calc(210mm - 1px) avoids the Chrome float-rounding bug that creates a blank 3rd page. */
          .page-intraop,
          .page-preoppost {
            min-height: unset !important;
            width: 297mm !important;
            height: calc(210mm - 1px) !important;
            padding: 7mm !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
            border: none !important;
            border-radius: 0 !important;
          }
          .page-preoppost { break-before: page; break-after: avoid; }
          /* Long cases: each detail sheet starts a new page */
          .page-intraop + .page-intraop { break-before: page; }
          /* Kill the on-screen space-y gap — a margin on a full-height sheet
             spills 12px onto an extra blank page */
          .page-intraop, .page-preoppost { margin: 0 !important; }
          /* Tighter internal rhythm on the intraop sheet — reclaims ~35px of
             height for the chart panels */
          .page-intraop { gap: 4px !important; }

          /* White paper regardless of dark mode */
          .protocol-root *:not(svg, svg *) {
            background-color: white !important;
            color: #1e293b !important;
            border-color: #e2e8f0 !important;
          }
          * { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          /* SVG light-mode is handled via beforeprint listener — no filter needed */

          /* Compact lab rows in print — overrides Tailwind text-[10.5px] / py-[2px] */
          .lab-compact .lab-entry > div {
            font-size: 8px !important;
            padding-top: 1px !important;
            padding-bottom: 1px !important;
          }
          .lab-compact .lab-entry > div > * { font-size: 8px !important; }
        }
      `}</style>}


      <div className="protocol-root space-y-3">

        {/* Review bar — summary mode only. Every write action inside it is
            gated on the capabilities the case endpoint reported. */}
        {!isPrint && (
          <ReviewBar
            caseId={caseId}
            status={data.status}
            canWrite={canWrite}
            finalizedAtMs={finalizedAtMs}
            now={now}
            labels={L}
            onFinalized={finalizedAt => setData(prev => prev ? { ...prev, status: "COMPLETE", finalizedAt } : prev)}
            onUnfinalized={() => setData(prev => prev ? { ...prev, status: "IN_PROGRESS", finalizedAt: null } : prev)}
          />
        )}

        {/* ═══════════════════════════════════════════════════════
            PAGE 1 — LANDSCAPE — INTRAOPERATIVE
        ════════════════════════════════════════════════════════ */}
        <div data-tour="summary-page1" className="page-intraop border border-slate-200 rounded-xl bg-white p-3 flex flex-col gap-2 min-h-[520px]">

          {/* Header — LOSPOR wordmark · procedure · institution/case block */}
          <div className="flex items-start justify-between border-b-2 border-blue-900 dark:border-blue-500 pb-2 gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[17px] font-black tracking-tight text-slate-900">LOSPOR</span>
                <span className="text-blue-800 dark:text-blue-400 text-[11px]">●</span>
                <span className="text-[11px] font-bold tracking-[0.18em] text-blue-900 dark:text-blue-300">{L.record}</span>
              </div>
              {p?.plannedProcedure && <div className="text-[13px] font-bold text-slate-900 mt-0.5">{p.plannedProcedure}</div>}
              {(p?.diagnosis || p?.icdCode) && (
                <div className="text-[9.5px] text-slate-500">{[p?.diagnosis, p?.icdCode].filter(Boolean).join(" · ")}</div>
              )}
            </div>
            <div className="text-right text-[9.5px] text-slate-500 leading-relaxed shrink-0">
              <div>{inst?.name}{inst?.city ? ` · ${inst.city}` : ""}</div>
              <div>{dateStr}</div>
              <div><span className="font-bold text-slate-800">{data.caseCode ? `Case ${data.caseCode}` : ""}</span>{isPrint ? `${data.caseCode ? " · " : ""}Page 1 of ${pageTotal}` : ""}</div>
            </div>
          </div>

          {/* Patient fill-in band — identity always blank, filled by hand */}
          <div className="border border-slate-200 rounded-lg bg-slate-50/60 dark:bg-[#181818] px-3 py-1.5 flex items-end gap-4">
            <div className="flex-1 min-w-0">
              <span className="text-[8.5px] text-slate-400">{L.patientName}</span>
              <div className="border-b border-slate-300 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[8.5px] text-slate-400">{L.idFile}</span>
              <div className="border-b border-slate-300 h-3.5" />
            </div>
            <div className="shrink-0 text-[10px] font-bold text-slate-800 flex items-center gap-3 pb-0.5">
              {p?.ageYears != null && <span>{p.ageYears} {ageSuffix}</span>}
              {p?.sex && <span>{locale === "bg" ? (p.sex === "MALE" ? "Мъж" : p.sex === "FEMALE" ? "Жена" : "") : (p.sex === "MALE" ? "Male" : p.sex === "FEMALE" ? "Female" : "")}</span>}
              {p?.bloodType && <span>{p.bloodType} Rh{p.rhFactor === "POSITIVE" ? "+" : p.rhFactor === "NEGATIVE" ? "−" : ""}</span>}
              {p?.heightCm && p?.weightKg && <span>{p.heightCm} cm / {p.weightKg} kg</span>}
              {p?.bmi != null && <span>BMI {formatBmi(p.bmi)}</span>}
              {ibwResolution.available && <span>IBW {ibwResolution.roundedKg} kg</span>}
            </div>
          </div>

          {/* GDPR privacy strip — screen only; the print footer carries the disclaimer */}
          <div className="no-print text-[7.6px] text-amber-700 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded px-2 py-[3px]">{L.privacyNote}</div>

          {/* Key-facts chip row */}
          {(() => {
            const kf: string[] = []
            if (techniques.length) kf.push(techniques.map((technique: string) => displayClinicalCode("option:TECHNIQUE", technique, locale)).join(" + "))
            const airway = deviceLabel(i, locale); if (airway && airway !== "—") kf.push(airway)
            if (airwayTools.length) kf.push(airwayTools.map((tool: string) => displayClinicalCode("option:AIRWAY_MANAGEMENT", tool, locale)).join(", "))
            const vent: string[] = []
            if (ventModes.length) vent.push(ventModes.map(mode => displayClinicalCode("ventilationMode", mode, locale)).join(", "))
            if (i?.peepCmH2O != null) vent.push(`PEEP ${i.peepCmH2O}`)
            if (vent.length) kf.push(vent.join(" · "))
            if (i?.volatileAgent) kf.push(displayClinicalCode("option:INHALATIONAL_AGENT", i.volatileAgent, locale, { label: i.volatileAgent }))
            if (positions.length) kf.push(positions.map((position: string) => displayClinicalCode("option:POSITION", position, locale)).join(" → "))
            if (duration()) kf.push(duration() as string)
            const access = vascular.map(a => `${displayClinicalCode("option:VASCULAR_ACCESS", a.site, locale, { label: a.siteLabel })} ${a.size ?? ""}${a.sizeUnit ?? ""}`.trim()).filter(Boolean).join(" · ")
            const pill = "text-[8.8px] text-slate-700 border border-slate-300 rounded-full px-2.5 py-[2px] whitespace-nowrap"
            return (
              <div className="flex flex-wrap gap-1.5 items-center">
                {p?.asaScore && (
                  <span className="text-[8.8px] font-bold text-blue-900 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 rounded-full px-2.5 py-[2px]">
                    ASA {p.asaScore}{p.emergencySurgery ? "E" : ""}
                  </span>
                )}
                {kf.map((f, idx) => <span key={idx} className={pill}>{f}</span>)}
                {activeMonitors.length > 0 && <span className={pill}>{L.monitoringShort} · {activeMonitors.join(" · ")}</span>}
                {access && <span className={pill}>{L.ivAccess} {access}</span>}
              </div>
            )
          })()}

          {/* Section label */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold tracking-[0.12em] text-blue-900 dark:text-blue-300">{L.intraopTt}</span>
            <div className="flex-1 h-px bg-blue-100 dark:bg-blue-900/60" />
          </div>

          {/* Timetable — stacked half-case panels at the same time scale.
              Numeric grid samples per panel; graph/drugs/events stay full-res. */}
          <div className="border border-slate-200 rounded-lg bg-white flex-1 min-h-0 overflow-hidden flex flex-col p-1 gap-0.5">
            {sheet0Panels.map(pl => (
              <div key={pl.index} className="flex-1 min-h-0">
                <PrintTimetable timetable={timetable} startISO={i?.startTime}
                  locale={locale} themeAware={!isPrint}
                  view={panelView(pl, sheet0Panels.length > 1)} />
              </div>
            ))}
            {(sheet0Panels.length > 1 || sheet0Panels[0].intervalMin > 5) && (
              <p className="text-[7.5px] text-slate-400 px-1.5 pb-0.5 shrink-0">
                {locale === "bg"
                  ? `Жизнените показатели в таблицата са през ${sheet0Panels[0].intervalMin} мин · графиката, медикаментите и събитията са в точно записаното време`
                  : `Vitals table sampled q${sheet0Panels[0].intervalMin}min · graph, drugs and events at exact recorded times`}
              </p>
            )}
          </div>

          {/* Bottom band: fluid balance · drug administration log · intraop notes */}
          <div className="grid grid-cols-[0.85fr_1.35fr_1fr] gap-2">
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1.5">{L.fluidBal.toUpperCase()} (ML)</p>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: "Crystalloid", value: i?.crystalloidsMl },
                  { label: "Colloid",     value: i?.colloidsMl },
                  { label: "Blood",       value: i?.bloodMl },
                  { label: "Urine",       value: i?.urineMl },
                ].map(({ label, value }) => (
                  <div key={label} className="border border-slate-200 rounded-md text-center py-1">
                    <p className="text-[13px] font-extrabold text-slate-900 leading-tight">{value ?? "—"}</p>
                    <p className="text-[7.5px] text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
              {i?.bloodProductsNote && <p className="text-[8px] text-slate-500 italic mt-1">{i.bloodProductsNote}</p>}
            </div>
            {/* Numbered log — the ① ② … pins on the chart resolve here */}
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1.5">{L.drugLog.toUpperCase()}</p>
              {drugLog.length === 0 && <p className="text-[10px] text-slate-400">{L.noDrugs}</p>}
              <div className="grid grid-cols-2 gap-x-3">
                {drugLog.map(d => (
                  <div key={d.n} className="flex items-center gap-1.5 text-[8.5px] leading-[12px] min-w-0">
                    <span className="inline-flex items-center justify-center w-[11px] h-[11px] rounded-full border text-[6.8px] font-bold shrink-0"
                      style={{ color: d.color, borderColor: d.color }}>{d.n}</span>
                    <span className="font-bold text-slate-500 text-[8px]" style={{ fontFamily: "Consolas, monospace" }}>{d.time}</span>
                    <span className="text-slate-700 truncate flex-1">{displayClinicalCode("option:INTRAOP_DRUG", d.name, locale, { label: d.name })}</span>
                    <span className="font-bold text-slate-900 whitespace-nowrap" style={{ fontFamily: "Consolas, monospace" }}>{d.dose}</span>
                  </div>
                ))}
              </div>
              {(drugTotals.length > 0 || infTotals.length > 0) && (
                <p className="text-[7px] text-slate-500 border-t border-slate-100 dark:border-[#252525] mt-1 pt-0.5 leading-[9.5px]">
                  <span className="font-bold">{L.totalsLbl}:</span>{" "}
                  {[
                    ...drugTotals.map(d => `${displayClinicalCode("option:INTRAOP_DRUG", d.name, locale, { label: d.name })} ${d.total} ${d.unit}`),
                    ...infTotals.map(d => `${displayClinicalCode("option:INTRAOP_INFUSION", d.name, locale, { label: d.name })} ${d.total} ${d.unit}`),
                  ].join(" · ")}
                </p>
              )}
            </div>
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1.5">{L.notes.toUpperCase()}</p>
              {i?.complications
                ? <p className="text-[9.5px] text-slate-700 leading-snug">{i.complications}</p>
                : <p className="text-[9.5px] text-slate-400">—</p>}
              {(i?.premedicationEvening || i?.premedicationMorning) && (
                <p className="text-[8px] text-slate-500 mt-1">
                  {L.premed}: {[i?.premedicationEvening && `${L.evening} ${displayOptionEntry("PREMED_DRUG", i.premedicationEvening, locale)}`, i?.premedicationMorning && `${L.morning} ${displayOptionEntry("PREMED_DRUG", i.premedicationMorning, locale)}`].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-8 mt-1">
            {[L.sigAnest, L.sigNurse, L.sigSurg].map(r => (
              <div key={r} className="border-t border-slate-300 pt-1"><p className="text-[8.5px] text-slate-400">{r} — {L.nameSig}</p></div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex justify-between text-[7.5px] text-slate-400 border-t border-slate-200 pt-1">
            <span>{L.footerLine}</span>
            <span>{L.generatedLbl} {format(new Date(), "dd MMM yyyy")}</span>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            CONTINUATION SHEETS — only for extreme (>~24h) cases
        ════════════════════════════════════════════════════════ */}
        {contSheets.map((sheetPanels, k) => (
          <div key={`cont-${k}`} className="page-intraop border border-slate-200 rounded-xl bg-white p-3 flex flex-col gap-2 min-h-[520px]">
            {/* Compact continued strip — identity fields live on Sheet 1 */}
            <div className="flex items-center justify-between border-b-2 border-blue-900 dark:border-blue-500 pb-1.5 gap-3">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-[13px] font-black tracking-tight text-slate-900">LOSPOR</span>
                <span className="text-[9.5px] font-bold tracking-[0.14em] text-blue-900 dark:text-blue-300">{L.record} · {contWord}</span>
                <span className="text-[9px] text-slate-500 truncate">
                  {[patientLine, p?.asaScore ? `ASA ${p.asaScore}${p.emergencySurgery ? "E" : ""}` : null,
                    techniques.length ? techniques.map((technique: string) => displayClinicalCode("option:TECHNIQUE", technique, locale)).join(" + ") : null,
                    locale === "bg" ? "самоличността — на лист 1" : "identity fields on Sheet 1"].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div className="text-right text-[9px] text-slate-500 shrink-0">
                <span className="font-bold text-slate-800">{colHHMM(sheetPanels[0].startCol)} – {colHHMM(sheetPanels[sheetPanels.length - 1].endCol + 1)}</span>
                {" · "}{locale === "bg" ? "жизнени показатели" : "vitals"} q{sheetPanels[0].intervalMin}min · {data.caseCode ? `Case ${data.caseCode} · ` : ""}{locale === "bg" ? `Стр. ${k + 2} от ${pageTotal}` : `Page ${k + 2} of ${pageTotal}`}
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg bg-white flex-1 min-h-0 overflow-hidden flex flex-col p-1 gap-0.5">
              {sheetPanels.map(pl => (
                <div key={pl.index} className="flex-1 min-h-0">
                  <PrintTimetable timetable={timetable} startISO={i?.startTime}
                    locale={locale} themeAware={!isPrint} view={panelView(pl, true)} />
                </div>
              ))}
            </div>

            {/* Signatures only on the final continuation sheet */}
            {k === contSheets.length - 1 && (
              <div className="grid grid-cols-3 gap-8">
                {[L.sigAnest, L.sigNurse, L.sigSurg].map(rr => (
                  <div key={rr} className="border-t border-slate-300 pt-1"><p className="text-[8.5px] text-slate-400">{rr} — {L.nameSig}</p></div>
                ))}
              </div>
            )}
            <div className="flex justify-between text-[7.5px] text-slate-400 border-t border-slate-200 pt-1">
              <span>{L.footerLine}</span>
              <span>{k < contSheets.length - 1 ? (locale === "bg" ? `Продължава на лист ${k + 3} · ` : `Continues on Sheet ${k + 3} · `) : ""}{L.generatedLbl} {format(new Date(), "dd MMM yyyy")}</span>
            </div>
          </div>
        ))}

        {/* ═══════════════════════════════════════════════════════
            PAGE 2 — PORTRAIT — PREOP + POSTOP
        ════════════════════════════════════════════════════════ */}
        <div data-tour="summary-page2" className="page-preoppost border border-slate-200 rounded-xl bg-white p-3 flex flex-col gap-2 min-h-[520px]">

          {/* Header — same wordmark system as Sheet 1 */}
          <div className="flex items-start justify-between border-b-2 border-blue-900 dark:border-blue-500 pb-2 gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[17px] font-black tracking-tight text-slate-900">LOSPOR</span>
                <span className="text-blue-800 dark:text-blue-400 text-[11px]">●</span>
                <span className="text-[11px] font-bold tracking-[0.18em] text-blue-900 dark:text-blue-300">{L.prepost}</span>
              </div>
              {p?.plannedProcedure && <div className="text-[13px] font-bold text-slate-900 mt-0.5">{p.plannedProcedure}</div>}
              {(p?.diagnosis || p?.icdCode) && (
                <div className="text-[9.5px] text-slate-500">{[p?.diagnosis, p?.icdCode].filter(Boolean).join(" · ")}</div>
              )}
            </div>
            <div className="text-right text-[9.5px] text-slate-500 leading-relaxed shrink-0">
              <div>{inst?.name}{inst?.city ? ` · ${inst.city}` : ""}</div>
              <div>{dateStr}</div>
              <div><span className="font-bold text-slate-800">{data.caseCode ? `Case ${data.caseCode}` : ""}</span>{isPrint ? `${data.caseCode ? " · " : ""}Page ${pageTotal} of ${pageTotal}` : ""}</div>
            </div>
          </div>

          {/* PREOPERATIVE ASSESSMENT */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold tracking-[0.12em] text-blue-900 dark:text-blue-300">{L.preopAssessment}</span>
            <div className="flex-1 h-px bg-blue-100 dark:bg-blue-900/60" />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {/* Risk scores + preop vitals */}
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1">{L.riskScores.toUpperCase()}</p>
              <F label="ASA"       value={p?.asaScore ? `Class ${p.asaScore}${p.emergencySurgery ? "E" : ""}` : null} />
              {p?.rcriScore  != null && <F label="RCRI"      value={`${p.rcriScore} / 6 — ${rcriRiskLabel(p.rcriScore)}`} />}
              {p?.apfelScore != null && <F label="Apfel"     value={`${p.apfelScore} / 4 — ${apfelRiskLabel(p.apfelScore)}`} />}
              {p?.stopBangScore != null && <F label="STOP-BANG" value={`${p.stopBangScore} / 8 — ${stopBangRiskLabel(p.stopBangScore)}`} />}
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1 mt-2">{L.preVitals.toUpperCase()}</p>
              <F label={L.bp}   value={p?.bpSystolic && p?.bpDiastolic ? `${p.bpSystolic} / ${p.bpDiastolic} mmHg` : null} />
              <F label={L.hr}   value={p?.heartRate ? `${p.heartRate} bpm` : null} />
              <F label="SpO₂"   value={p?.spO2 ? `${p.spO2} %` : null} />
              <F label={L.temp} value={p?.temperature ? `${p.temperature} °C` : null} />
              <F label={L.rr}   value={p?.respiratoryRate ? `${p.respiratoryRate}/min` : null} />
            </div>
            {/* Airway + anthropometry */}
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1">{L.airwayAssessment.toUpperCase()}</p>
              <F label="Mallampati"      value={p?.mallampati ? displayClinicalCode("option:MALLAMPATI", p.mallampati, locale) : null} />
              <F label={L.mouthOpening}  value={p?.mouthOpeningCm ? `${p.mouthOpeningCm} cm` : null} />
              <F label={L.thyromental}   value={p?.thyromental ? `${p.thyromental} cm` : null} />
              <F label={L.neckMobility}  value={p?.neckMobility ? displayClinicalCode("option:NECK_MOBILITY", p.neckMobility, locale) : null} />
              <F label="ULBT"            value={p?.upperLipBiteTest ? displayClinicalCode("option:UPPER_LIP_BITE", p.upperLipBiteTest, locale) : null} />
              <F label={L.clGrade}       value={p?.cormackLehane ? displayClinicalCode("option:CORMACK_LEHANE", p.cormackLehane, locale) : null} />
              {p?.difficultAirwayHistory
                ? <p className="text-[8.5px] font-semibold text-red-700 bg-red-50 rounded px-1.5 py-0.5 mt-1.5 inline-block">{L.difficultAirway}{p.difficultAirwayNotes ? ": " + p.difficultAirwayNotes : ""}</p>
                : <p className="text-[8.5px] font-medium text-green-700 bg-green-50 rounded px-1.5 py-0.5 mt-1.5 inline-block">{L.noDifficultAirway}</p>}
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1 mt-2">{L.anthropometry.toUpperCase()}</p>
              <F label={L.heightWeight} value={p?.heightCm && p?.weightKg ? `${p.heightCm} cm / ${p.weightKg} kg` : null} />
              <F label="BMI"           value={p?.bmi ? `${formatBmi(p.bmi)} kg/m²` : null} />
            </div>
            {/* History & comorbidities + meds + allergies */}
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1">{L.histCom.toUpperCase()}</p>
              {comorbidities.length > 0 && (
                <div className="flex flex-wrap mb-1">{comorbidities.map((c, idx) => <Chip key={idx} color="amber">{c.label ?? String(c)}</Chip>)}</div>
              )}
              {currentMedicationsText && (
                <>
                  <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1 mt-1.5">{L.medications.toUpperCase()}</p>
                  <p className="text-[9.5px] text-slate-700 leading-snug">{currentMedicationsText}</p>
                </>
              )}
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-red-800 mb-0.5 mt-1.5">{L.allergies.toUpperCase()}</p>
              {(p?.allergies || p?.latexAllergy) ? (
                <>
                  {allergyDetailsText && <p className="text-[9.5px] font-bold text-red-700">{allergyDetailsText}</p>}
                  {p?.latexAllergy   && <p className="text-[9px] text-red-600">{L.latexAllergy}</p>}
                </>
              ) : <p className="text-[9px] text-slate-500">{L.nkda}</p>}
              {p?.familyAnesthesiaProblems && (
                <p className="text-[8.5px] text-amber-700 mt-1.5">{L.familyHistory}</p>
              )}
            </div>
            {/* Investigations */}
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1">{L.investigations.toUpperCase()}</p>
              {labResults.length > 0 ? (
                <div
                  className={labResults.length >= 12 ? "lab-compact" : ""}
                  style={{ columns: labResults.length >= 24 ? 2 : 1, columnGap: "0.5rem" }}
                >
                  {labResults.map((l, idx) => (
                    <div key={idx} className="lab-entry" style={{ breakInside: "avoid" }}>
                      <F label={l.test ?? ""} value={`${l.value}${l.unit ? " " + l.unit : ""}`} />
                    </div>
                  ))}
                </div>
              ) : <p className="text-[9px] text-slate-400">—</p>}
            </div>
          </div>

          {/* POSTOPERATIVE RECOVERY */}
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

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-8 mt-1">
            {[L.sigAnest, L.sigNurse, L.sigSurg].map(r => (
              <div key={r} className="border-t border-slate-300 pt-1"><p className="text-[8.5px] text-slate-400">{r} — {L.nameSig}</p></div>
            ))}
          </div>
          <div className="flex justify-between text-[7.5px] text-slate-400 border-t border-slate-200 pt-1">
            <span>{L.footerLine}</span>
            <span>{L.generatedLbl} {format(new Date(), "dd MMM yyyy")}</span>
          </div>
        </div>

        {/* Print-only disclaimer footer — summary mode only. In print mode the
            sheets are exact A4 pages with their own footers; any content after
            the last sheet would spill onto a blank extra page. */}
        {!isPrint && (
          <div className="print-only hidden" style={{ display: "none" }}>
            <style>{`@media print { .lospor-print-disclaimer { display: block !important; } }`}</style>
            <p className="lospor-print-disclaimer text-[7px] text-center text-slate-400 mt-2 border-t border-slate-200 pt-1">
              {L.screenDisclaimer}
            </p>
          </div>
        )}
      </div>
    </>
  )
}
