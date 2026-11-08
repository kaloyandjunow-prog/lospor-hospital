"use client"

import { format } from "date-fns"
import { useMemo } from "react"
import { plannedProcedureLabel, plannedProcedureText } from "@lospor/core/procedure-codes"
import { cancellationReasonLabel } from "@lospor/core/case-cancellation"
import { displayApfelRisk, displayRcriRisk, displayStopBangRisk } from "@lospor/core/risk-band-display"
import { aldreteBand, handoverGroups, stewardBand } from "@lospor/core/postop"
import { calculateDrugTotals } from "@lospor/core/intraop-summary"
import { formatInfusionTotal } from "@lospor/core/intraop-totals"
import { resolveIdealBodyWeight } from "@lospor/core/ideal-body-weight"
import { buildRecordEpisodes, buildRecordEventLog } from "@lospor/core/record-log"
import { recordLabels } from "@lospor/core/record-labels"
import { buildRecordTimetable } from "@lospor/core/record-timetable"
import { displayClinicalCode, toClinicalLocale } from "@/lib/clinical-display"
import type { Tag } from "@/components/TagInput"
import type { CaseDetail } from "@/types/case-detail"
import type { LegacyKeyEvents } from "@/types/timetable"
import { HistoryAndAllergiesBox } from "@/components/case-summary/HistoryAndAllergiesBox"
import { InvestigationsBox } from "@/components/case-summary/InvestigationsBox"
import { PostopRecoverySection } from "@/components/case-summary/PostopRecoverySection"
import { groupLabDraws } from "@/components/case-summary/investigations"
import { LABELS } from "@/components/case-summary/labels"
import { calcInfTotals, useInfusionWeightBasis } from "@/components/case-summary/print-infusion-totals"
import { printCaseDate, printTimeSpan } from "@/components/case-summary/print-format"
import { MON, SummaryChip as Chip, SummaryField as F } from "@/components/case-summary/SummaryPrimitives"
import { accessLabel, deviceLabel, formatBmi } from "@/components/case-summary/summary-labels"
import { RecordChart } from "./RecordChart"
import { EventLogTable, VitalsTable } from "./RecordTables"
import { recordPageCss } from "./record-page-css"

/**
 * The anaesthesia record (mock E): one document for the case summary on the web and for the print sheet.
 * Portrait first page (who, risk, airway, access, the event log and the vitals), one landscape page with
 * the whole timetable, and a closing page (episodes, totals, fluids, recovery, name and signatures).
 * Light paper in every theme; pages grow with the case, none is cut off.
 */
const H = "rec-h text-[9px] font-bold tracking-[0.12em] uppercase text-blue-900 mb-1"
const BOX = "border border-slate-200 rounded-md p-2 bg-white break-inside-avoid"

export function RecordSheets({ data, locale }: { data: CaseDetail; locale: string }) {
  const R = recordLabels(locale)
  const L = locale === "bg" ? LABELS.bg : LABELS.en
  const bandLocale = toClinicalLocale(locale)
  const infusionWeightBasis = useInfusionWeightBasis()
  const p = data.preop, i = data.intraop, o = data.postop, inst = data.institution
  const timetable = ((i?.keyEvents && typeof i.keyEvents === "object" && !Array.isArray(i.keyEvents)) ? i.keyEvents : {}) as LegacyKeyEvents
  const hospital = inst?.name ?? "LOSPOR"

  const model = useMemo(() => buildRecordTimetable(timetable, { startedAt: i?.startedAt, startISO: i?.startTime, timezone: i?.timezone }, locale), [timetable, i?.startedAt, i?.startTime, i?.timezone, locale])
  const log = useMemo(() => buildRecordEventLog(timetable.log, (data as { deletedEvents?: unknown[] }).deletedEvents, i?.timezone, locale), [timetable.log, data, i?.timezone, locale])
  const episodes = useMemo(() => buildRecordEpisodes(timetable.log, i?.timezone, locale), [timetable.log, i?.timezone, locale])

  const ibw = resolveIdealBodyWeight({
    clinicalMode: data.clinicalMode === "PEDIATRIC" ? "PEDIATRIC" : "ADULT", heightCm: p?.heightCm, sex: p?.sex,
    age: data.clinicalMode === "PEDIATRIC" && p?.ageValue != null && p.ageUnit ? { value: p.ageValue, unit: p.ageUnit } : null,
  })
  const techniques: string[] = Array.isArray(i?.techniques) ? i.techniques : []
  const positions: string[] = Array.isArray(i?.positions) ? i.positions : []
  const ventModes: string[] = Array.isArray(i?.ventilationModes) ? i.ventilationModes : []
  const airwayTools: string[] = Array.isArray(i?.airwayTools) ? i.airwayTools : []
  const vascular = (Array.isArray(i?.vascularAccesses) ? i.vascularAccesses : []) as Array<{ site?: string; siteLabel?: string; size?: string; sizeUnit?: string }>
  const comorbidities: Tag[] = Array.isArray(p?.comorbidities) ? p.comorbidities : []
  const text = (raw: string | null | undefined, keys: string[]) => {
    if (!raw) return null
    const trimmed = raw.trim()
    if (!trimmed.startsWith("[")) return raw
    try {
      const parsed = JSON.parse(trimmed) as unknown[]
      if (Array.isArray(parsed)) return parsed.map(item => { const m = item as Record<string, unknown>; return keys.map(k => m[k]).find(v => typeof v === "string" && v) as string | undefined }).filter(Boolean).join(", ")
    } catch { /* free text that happens to start with a bracket */ }
    return raw
  }
  const monitors = MON.filter(m => i?.[m.f]).map(m => displayClinicalCode("option:MONITORING", m.f, locale))
  const performed = plannedProcedureText(o?.performedProceduresJson)
  const cancelled = (data as { status?: string }).status === "CANCELLED"
  const theatre = (data as { theatreName?: string | null }).theatreName ?? data.theatre?.name ?? null
  const ageSuffix = locale === "bg" ? "г." : "y"
  const drugTotals = calculateDrugTotals({ drugs: timetable.drugs ?? [] })
  const infTotals = calcInfTotals(timetable, { ibw: ibw.available ? ibw.roundedKg : null, tbw: p?.weightKg, heightCm: p?.heightCm, endedAt: i?.endedAt, weightBasis: infusionWeightBasis, ageYears: p?.ageYears, ageValue: p?.ageValue, ageUnit: p?.ageUnit, sex: p?.sex })
  const draws = groupLabDraws(i?.labResults, L.undatedDraw, at => format(new Date(at), "HH:mm"))
  const steward = data.clinicalMode === "PEDIATRIC"
  const recoveryTotal = steward ? o?.stewardTotal : o?.aldreteTotal
  const band = recoveryTotal != null ? (steward ? stewardBand(recoveryTotal) : aldreteBand(recoveryTotal)) : null
  const bandStyle = band === "ready" ? "bg-green-100 text-green-800 border-green-300" : band === "observe" ? "bg-amber-100 text-amber-800 border-amber-300" : band === "not_ready" ? "bg-red-100 text-red-800 border-red-300" : "bg-white text-slate-500 border-slate-200"
  const handoverLookup = Object.fromEntries(handoverGroups(locale === "bg" ? "bg" : "en").flatMap(g => g.items.map(item => [item.code, item.label])))
  const handoverItems: string[] = Array.isArray(o?.handoverItems) ? o.handoverItems : []
  const vitalGroups = model.vitals.length > 72 ? 4 : 3
  const drugName = (name: string) => displayClinicalCode("option:INTRAOP_DRUG", name, locale, { label: name })
  const airway = deviceLabel(i, locale)
  const fluidCells: Array<[string, number | null | undefined]> = [
    [L.fluidCrystalloid, i?.crystalloidsMl], [L.fluidColloid, i?.colloidsMl], [L.fluidBlood, i?.bloodMl],
    [L.fluidInfusions, (i as { infusionsMl?: number | null } | null | undefined)?.infusionsMl], [L.fluidUrine, i?.urineMl], [L.fluidBloodLoss, i?.bloodLossMl],
  ]

  return (
    <div className="record-root text-slate-900" data-testid="record-sheets">
      <style>{recordPageCss(hospital, R.page, R.of)}</style>

      {/* ── Portrait: who, risk, airway, access, the event log, the vitals ── */}
      <section className="rec-port rec-sheet" data-testid="record-page-1" data-tour="summary-page1">
        <header className="flex items-start justify-between gap-3 border-b-2 border-blue-900 pb-2 mb-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2"><span className="text-[17px] font-black tracking-tight">{hospital}</span><span className="text-[10px] font-bold tracking-[0.16em] text-blue-900 uppercase">{R.title}</span></div>
            {plannedProcedureLabel(p, locale) && <div className="text-[13px] font-bold mt-0.5">{plannedProcedureLabel(p, locale)}</div>}
            {performed && performed !== p?.plannedProcedure && <div className="text-[10.5px]" data-testid="summary-performed">{L.performedLbl}: <b>{performed}</b></div>}
            {(p?.diagnosis || p?.icdCode) && <div className="text-[9.5px] text-slate-500">{[p?.diagnosis, p?.icdCode].filter(Boolean).join(" · ")}</div>}
          </div>
          <div className="text-right text-[9.5px] text-slate-500 leading-relaxed shrink-0">
            <div>{printCaseDate(i, locale)}</div>
            {theatre && <div data-testid="print-theatre">{L.theatreLbl} <b className="text-slate-800">{theatre}</b></div>}
            {data.caseCode && <div><b className="text-slate-800">{L.caseLbl} {data.caseCode}</b></div>}
          </div>
        </header>

        {cancelled && (
          <div data-testid="summary-cancelled" className="border-2 border-orange-500 bg-orange-50 rounded-md px-3 py-2 mb-2 text-[12px] font-bold text-orange-900">
            {L.cancelledLbl}{cancellationReasonLabel(data.cancellationReason, locale) ? ` · ${cancellationReasonLabel(data.cancellationReason, locale)}` : ""}
            {data.cancellationNote ? <span className="font-normal"> — {data.cancellationNote}</span> : null}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 mb-1.5">
          <div className={BOX}><p className={H}>{R.patient}</p>
            <div className="text-[11px] leading-snug">
              {[p?.ageYears != null ? `${p.ageYears} ${ageSuffix}` : "", p?.sex === "MALE" ? (locale === "bg" ? "м" : "M") : p?.sex === "FEMALE" ? (locale === "bg" ? "ж" : "F") : "", p?.bloodType ? `${p.bloodType} Rh${p.rhFactor === "POSITIVE" ? "+" : p.rhFactor === "NEGATIVE" ? "−" : ""}` : ""].filter(Boolean).join(" · ")}
              {p?.heightCm && p?.weightKg ? <div>{p.heightCm} cm / {p.weightKg} kg</div> : null}
              {p?.bmi != null || ibw.available ? <div>{p?.bmi != null ? `BMI ${formatBmi(p.bmi)}` : ""}{p?.bmi != null && ibw.available ? " · " : ""}{ibw.available ? `IBW ${ibw.roundedKg} kg` : ""}</div> : null}
            </div></div>
          <div className={BOX}><p className={H}>{R.risk}</p>
            <F label="ASA" value={p?.asaScore ? `${L.asaClass} ${p.asaScore}${p.emergencySurgery ? "E" : ""}` : null} />
            {p?.rcriScore != null && <F label="RCRI" value={`${p.rcriScore} / 6 — ${displayRcriRisk(p.rcriScore, bandLocale).label}`} />}
            {p?.apfelScore != null && <F label="Apfel" value={`${p.apfelScore} / 4 — ${displayApfelRisk(p.apfelScore, bandLocale).label}`} />}
            {p?.stopBangScore != null && <F label="STOP-BANG" value={`${p.stopBangScore} / 8 — ${displayStopBangRisk(p.stopBangScore, bandLocale).label}`} />}
          </div>
          <div className={BOX}><p className={H}>{R.times}</p>
            <F label={R.start} value={printTimeSpan(i?.startTime, i?.endTime, locale, i)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 mb-1.5">
          <div className={BOX}><p className={H}>{L.airwayAssessment}</p>
            <F label="Mallampati" value={p?.mallampati ? displayClinicalCode("option:MALLAMPATI", p.mallampati, locale) : null} />
            <F label={L.mouthOpening} value={p?.mouthOpeningCm ? `${p.mouthOpeningCm} cm` : null} />
            <F label={L.thyromental} value={p?.thyromental ? `${p.thyromental} cm` : null} />
            <F label={L.neckMobility} value={p?.neckMobility ? displayClinicalCode("option:NECK_MOBILITY", p.neckMobility, locale) : null} />
            <F label={L.clGrade} value={p?.cormackLehane ? displayClinicalCode("option:CORMACK_LEHANE", p.cormackLehane, locale) : null} />
            {p?.difficultAirwayHistory === true && <p className="text-[8.5px] font-semibold text-red-700 bg-red-50 rounded px-1.5 py-0.5 mt-1">{L.difficultAirway}{p.difficultAirwayNotes ? `: ${p.difficultAirwayNotes}` : ""}</p>}
            {p?.anticipatedDifficultAirway === true && <p className="text-[8.5px] font-semibold text-red-700 bg-red-50 rounded px-1.5 py-0.5 mt-1">{L.anticipatedDifficultAirway}</p>}
          </div>
          <div className={`${BOX} sm:col-span-2`}>
            <HistoryAndAllergiesBox preop={p} labels={L as unknown as Record<string, string>} comorbidities={comorbidities}
              currentMedicationsText={text(p?.currentMedications, ["label", "inn", "name"])} allergyDetailsText={text(p?.allergyDetails, ["label", "name"])} Chip={Chip} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 mb-1.5">
          <div className={BOX}><p className={H}>{R.airway}</p>
            <F label={R.airwayDevice} value={airway !== "—" ? airway : null} />
            {airwayTools.length > 0 && <F label="" value={airwayTools.map(tool => displayClinicalCode("option:AIRWAY_MANAGEMENT", tool, locale)).join(", ")} />}
          </div>
          <div className={BOX}><p className={H}>{R.access}</p><F label="" value={accessLabel(i, vascular, locale) || "—"} /></div>
          <div className={BOX}><p className={H}>{R.technique}</p>
            <div className="text-[10.5px] leading-snug">
              {techniques.length > 0 && <div>{techniques.map(t => displayClinicalCode("option:TECHNIQUE", t, locale)).join(" + ")}</div>}
              {ventModes.length > 0 && <div>{ventModes.map(m => displayClinicalCode("ventilationMode", m, locale)).join(", ")}{i?.peepCmH2O != null ? ` · PEEP ${i.peepCmH2O}` : ""}</div>}
              {i?.volatileAgent && <div>{displayClinicalCode("option:INHALATIONAL_AGENT", i.volatileAgent, locale, { label: i.volatileAgent })}</div>}
              {positions.length > 0 && <div>{positions.map(pos => displayClinicalCode("option:POSITION", pos, locale)).join(" → ")}</div>}
              {monitors.length > 0 && <div className="text-slate-500">{L.monitoringShort} · {monitors.join(" · ")}</div>}
            </div></div>
        </div>

        <div className={`${BOX} mb-1.5 rec-flow`}>
          <p className={H}>{R.eventLog} <span className="font-normal normal-case tracking-normal text-slate-500">· {R.eventLogNote}</span></p>
          {log.length > 0 ? <EventLogTable rows={log} labels={R} /> : <p className="text-[10px] text-slate-400">—</p>}
        </div>

        {model.vitals.length > 0 && (
          <div className={`${BOX} rec-flow`}>
            <p className={H}>{R.vitals} <span className="font-normal normal-case tracking-normal text-slate-500">· {R.vitalsEveryFive} ({model.vitals.length})</span></p>
            <VitalsTable model={model} labels={R} columns={vitalGroups} bp={locale === "bg" ? "АН" : "BP"} hr={locale === "bg" ? "Пулс" : "HR"} />
          </div>
        )}
      </section>

      {/* ── Landscape: the whole timetable on one page ── */}
      <section className="rec-land rec-sheet" data-testid="record-page-timetable" data-tour="summary-page2">
        <div className="flex items-baseline justify-between border-b-2 border-blue-900 pb-1 mb-2">
          <div className="flex items-baseline gap-2"><span className="text-[15px] font-black">{hospital}</span><span className="text-[10px] font-bold tracking-[0.16em] text-blue-900 uppercase">{R.timetable}</span></div>
          <div className="text-[9.5px] text-slate-500">{plannedProcedureLabel(p, locale)}{data.caseCode ? ` · ${L.caseLbl} ${data.caseCode}` : ""} · {printCaseDate(i, locale)}</div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]"><RecordChart model={model} labelWidth={locale === "bg" ? 132 : 118} /></div>
        </div>
        <div className="flex flex-wrap gap-x-4 text-[10px] text-slate-500 mt-1">
          <span><i className="inline-block w-[9px] h-[9px] rotate-45 bg-[#0369a1] mr-1.5" />{R.dose}</span>
          <span><i className="inline-block w-[9px] h-[9px] rotate-45 bg-[#d97706] mr-1.5" />★ {R.fromCard}</span>
          <span className="text-red-700">▮ {R.episodeLegend}</span>
        </div>
      </section>

      {/* ── Portrait: episodes, totals, fluids, recovery, name and signatures ── */}
      <section className="rec-port rec-sheet rec-end" data-testid="record-page-end">
        {episodes.length > 0 && (
          <div className={`${BOX} mb-1.5`}><p className={H}>{R.episodes}</p>
            {episodes.map(ep => (
              <div key={ep.id} className="border-l-[3px] border-red-700 pl-2 my-1" data-testid="record-episode">
                <b className="text-red-700 text-[11px]">{ep.from}{ep.to ? `–${ep.to}` : ""} · {ep.label}</b>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {ep.treated.map((t, ti) => <span key={ti} className={`text-[10px] px-2 rounded-full border ${t.card ? "border-amber-600 text-amber-800" : "border-slate-300 text-slate-700"}`}>{t.text} {t.time}</span>)}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-1.5">
          <div className={BOX}><p className={H}>{R.drugTotals}</p>
            <table className="w-full text-[10.5px]"><tbody>
              {drugTotals.map(d => <tr key={d.name} className="border-b border-slate-100"><td>{drugName(d.name)}</td><td className="text-right font-bold">{d.total} {d.unit}</td></tr>)}
              {infTotals.map(d => <tr key={d.name} className="border-b border-slate-100"><td>{displayClinicalCode("option:INTRAOP_INFUSION", d.name, locale, { label: d.name })} {R.infusionSuffix}</td><td className="text-right font-bold">{formatInfusionTotal(d)}{d.volumeMl != null ? ` · ${d.volumeMl} mL` : ""}{d.stopUnconfirmed ? L.stopUnconfirmedNote : ""}</td></tr>)}
            </tbody></table>
            {drugTotals.length + infTotals.length === 0 && <p className="text-[10px] text-slate-400">{L.noDrugs}</p>}
          </div>
          <div className="grid gap-1.5 content-start">
            <div className={BOX}><p className={H}>{R.fluidBalance} (mL)</p>
              <div className="grid grid-cols-3 gap-1.5">
                {fluidCells.map(([label, value]) => <div key={label} className="border border-slate-200 rounded text-center py-1"><p className="text-[13px] font-extrabold leading-tight">{value ?? "—"}</p><p className="text-[8px] text-slate-500">{label}</p></div>)}
              </div></div>
            {draws.length > 0 && <InvestigationsBox shownDraws={draws} title={L.investigations} Field={F} />}
          </div>
        </div>

        <div className={`${BOX} mb-1.5`} data-testid="record-recovery"><p className={H}>{R.recovery}</p>
          <PostopRecoverySection postop={o} labels={L as unknown as Record<string, string>} aldreteBg={bandStyle} aldreteStatus={band} steward={steward}
            handoverItems={handoverItems} handoverLookup={handoverLookup} Field={F} locale={locale} />
        </div>

        {i?.complications && <div className={`${BOX} mb-1.5`}><p className={H}>{L.notes}</p><p className="text-[10.5px] leading-snug">{i.complications}</p></div>}

        {/* Name and ID last, on the same sheet as the signatures, with room to write by hand. */}
        <div className="grid grid-cols-2 gap-1.5 mb-2 break-inside-avoid">
          <div className={`${BOX} h-[78px]`}><p className={H}>{R.patientName}</p></div>
          <div className={`${BOX} h-[78px]`}><p className={H}>{R.patientId}</p></div>
        </div>
        <div className="grid grid-cols-3 gap-5 break-inside-avoid">
          {[R.signatures.anaesthesiologist, R.signatures.nurse, R.signatures.surgeon].map(label => (
            <div key={label} className="border-t border-slate-500 pt-1 h-[70px] text-[9.5px] text-slate-500">{label}</div>
          ))}
        </div>
      </section>
    </div>
  )
}
