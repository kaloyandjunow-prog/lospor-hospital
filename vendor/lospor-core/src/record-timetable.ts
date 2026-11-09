import { clinicalDisplayLabel, formatClinicalGasMixLabel, type ClinicalLocale } from "./display"
import { summaryLaneDomain } from "./clinical-display"
import { INTRAOP_COLUMN_MINUTES } from "./intraop-engine"
import { colToHHMM } from "./summary-timetable"
import { localTimeOf } from "./intraop-time"
import { tciTargetText } from "./tci"
import type {
  AgentSegment, GasSettingsSegment, LegacyKeyEvents, PositionSegment, TimetableFluid, TimetableInfusion, VitalsEntry,
} from "./intraop-types"

/**
 * The whole-case timetable of the record (mock E, 2026-11-08), as plain data: vitals by column, one lane per
 * drug with its doses, one lane per infusion / agent / gas / fluid with its bars, and the episodes as bands.
 * The web, the PWA and the print sheet each draw this; none of them reads the projected chart themselves.
 */
export type RecordDose = { col: number; label: string; card: boolean }
export type RecordBar = { startCol: number; endCol: number; label: string }
export type RecordLane =
  | { kind: "bolus"; name: string; doses: RecordDose[] }
  | { kind: "bars"; tone: "infusion" | "agent" | "gas" | "fluid" | "position"; name: string; bars: RecordBar[]; total?: string }

export type RecordVitalPoint = { col: number } & Pick<VitalsEntry, "systolic" | "diastolic" | "heartRate" | "spO2" | "etco2" | "temp">
export type RecordEpisode = { fromCol: number; toCol: number; label: string }
export type RecordFlag = { col: number; label: string }

export type RecordTimetable = {
  /** First and last column of the chart (inclusive). */
  firstCol: number
  lastCol: number
  vitals: RecordVitalPoint[]
  lanes: RecordLane[]
  episodes: RecordEpisode[]
  flags: RecordFlag[]
  /** Time of day of a column, as the chart prints it. */
  time: (col: number) => string
}

type Blob = LegacyKeyEvents & { log?: Array<Record<string, unknown>> }

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

function laneName(kind: "agent" | "infusion" | "fluid" | "position", code: string, locale: ClinicalLocale): string {
  const domain = summaryLaneDomain(kind)
  return domain ? clinicalDisplayLabel(domain, code, locale, { label: code }) : code
}

/** Bars of a segment, cut where its rate (or percent) changed, each labelled with the value in force. */
function cutAt(startCol: number, endCol: number, first: string, changes: Array<{ col: number; label: string }>): RecordBar[] {
  const points = changes.filter(c => c.col > startCol && c.col <= endCol).sort((a, b) => a.col - b.col)
  const bars: RecordBar[] = []
  let from = startCol
  let label = first
  for (const change of points) {
    bars.push({ startCol: from, endCol: change.col - 1, label })
    from = change.col
    label = change.label
  }
  bars.push({ startCol: from, endCol, label })
  return bars.filter(b => b.endCol >= b.startCol)
}

const barEnd = (seg: { endCol?: number; startCol?: number }, lastCol: number) => (finite(seg.endCol) ? seg.endCol : lastCol)

function gasLabel(g: GasSettingsSegment, locale: ClinicalLocale): string {
  const mix = formatClinicalGasMixLabel(g, locale)
  return `${mix} · FGF ${g.fgf} L/min`
}

/** What fixes column zero in time: the saved start instant and zone, else the legacy wall-clock start. */
export type RecordClock = { startedAt?: string | Date | null; startISO?: string | null; timezone?: string | null }

export function buildRecordTimetable(kev: unknown, clock: RecordClock, locale: string): RecordTimetable {
  const { startISO } = clock
  const lang: ClinicalLocale = locale === "bg" ? "bg" : "en"
  const t = (kev && typeof kev === "object" && !Array.isArray(kev) ? kev : {}) as Blob
  const vitals = asArray<VitalsEntry>(t.vitals)
  const drugs = asArray<NonNullable<LegacyKeyEvents["drugs"]>[number]>(t.drugs).filter(d => !d.planned)
  const infusions = asArray<TimetableInfusion>(t.infusions).filter(i => !i.planned)
  const agents = asArray<AgentSegment>(t.agents).filter(a => !a.planned)
  const gas = asArray<GasSettingsSegment>(t.gasSettings).filter(g => !g.planned)
  const fluids = asArray<TimetableFluid>(t.fluids).filter(f => !f.planned)
  const positions = asArray<PositionSegment>(t.positions)
  const events = asArray<NonNullable<LegacyKeyEvents["clinicalEvents"]>[number]>(t.clinicalEvents).filter(e => !e.planned)
  const log = asArray<Record<string, unknown>>(t.log)

  const lastCol = Math.max(
    vitals.length - 1,
    ...drugs.map(d => d.colIdx), ...infusions.map(i => barEnd(i, 0)), ...agents.map(a => barEnd(a, 0)),
    ...gas.map(g => barEnd(g, 0)), ...fluids.map(f => barEnd(f, 0)), ...events.map(e => e.colIdx), 12,
  )

  // Bolus lanes: one per drug, in the order each was first given.
  const byDrug = new Map<string, RecordLane & { kind: "bolus" }>()
  const cardOf = new Map(log.filter(e => typeof e.id === "string").map(e => [e.id as string, typeof e.suggestion === "string" && e.suggestion.startsWith("card:")]))
  for (const d of [...drugs].sort((a, b) => a.colIdx - b.colIdx)) {
    const name = clinicalDisplayLabel("option:INTRAOP_DRUG", d.name, lang, { label: d.name })
    const lane = byDrug.get(d.name) ?? { kind: "bolus" as const, name, doses: [] }
    lane.doses.push({ col: d.colIdx, label: `${d.dose} ${d.unit}`.trim(), card: !!(d.eventId && cardOf.get(d.eventId)) || (typeof d.suggestion === "string" && d.suggestion.startsWith("card:")) })
    byDrug.set(d.name, lane)
  }

  const lanes: RecordLane[] = [...byDrug.values()]
  for (const i of infusions) {
    const end = barEnd(i, lastCol)
    const first = tciTargetText(i) ?? `${i.rate} ${i.unit}`.trim()
    const changes = (i.rateChanges ?? []).filter(c => !c.planned).map(c => ({ col: c.col, label: `${c.rate}` }))
    lanes.push({ kind: "bars", tone: "infusion", name: laneName("infusion", i.name, lang), bars: cutAt(i.startCol, end, first, changes) })
  }
  for (const a of agents) {
    const end = barEnd(a, lastCol)
    const pct = (v: number | undefined) => (v == null ? "" : `${v} %`)
    const changes = (a.percentChanges ?? []).filter(c => !c.planned).map(c => ({ col: c.col, label: pct(c.percent) }))
    lanes.push({ kind: "bars", tone: "agent", name: laneName("agent", a.name, lang), bars: cutAt(a.startCol, end, pct(a.percent), changes) })
  }
  if (gas.length) {
    const bars: RecordBar[] = []
    for (const g of gas) {
      const end = barEnd(g, lastCol)
      const changes = (g.settingsChanges ?? []).filter(c => !c.planned).map(c => ({ col: c.col, label: `FGF ${c.fgf} L/min` }))
      bars.push(...cutAt(g.startCol, end, gasLabel(g, lang), changes))
    }
    lanes.push({ kind: "bars", tone: "gas", name: lang === "bg" ? "Поток на свежи газове" : "FGF", bars })
  }
  const byFluid = new Map<string, { name: string; bars: RecordBar[] }>()
  for (const f of fluids) {
    const entry = byFluid.get(f.name) ?? { name: laneName("fluid", f.name, lang), bars: [] }
    entry.bars.push({ startCol: f.startCol, endCol: barEnd(f, lastCol), label: f.volume ? `${f.volume} mL` : "" })
    byFluid.set(f.name, entry)
  }
  for (const f of byFluid.values()) lanes.push({ kind: "bars", tone: "fluid", name: f.name, bars: f.bars })
  if (positions.length) {
    lanes.push({
      kind: "bars", tone: "position", name: lang === "bg" ? "Позиция" : "Position",
      bars: positions.map(p => ({ startCol: p.startCol, endCol: barEnd(p, lastCol), label: laneName("position", String(p.position ?? ""), lang) })),
    })
  }

  // Episodes: a complication with an end is a band; a moment is a thin one column wide.
  const COL_MS = INTRAOP_COLUMN_MINUTES * 60_000
  // Column zero is the saved start instant; a case from before it was kept starts at its first entry.
  const firstTs = log.map(e => (typeof e.ts === "string" ? Date.parse(e.ts) : NaN)).filter(Number.isFinite).sort((a, b) => a - b)[0]
  const anchorRaw = clock.startedAt != null ? Date.parse(String(clock.startedAt instanceof Date ? clock.startedAt.toISOString() : clock.startedAt)) : firstTs ?? NaN
  const startMs = Number.isFinite(anchorRaw) ? Math.floor(anchorRaw / COL_MS) * COL_MS : NaN
  const time = (col: number): string => {
    if (Number.isFinite(startMs)) {
      const at = new Date(startMs + col * COL_MS)
      const local = clock.timezone ? localTimeOf(at, clock.timezone) : null
      return local ?? `${String(at.getUTCHours()).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")}`
    }
    return colToHHMM(col, startISO)
  }
  const colOf = (ts: unknown) => (typeof ts === "string" && Number.isFinite(startMs) && Number.isFinite(Date.parse(ts)) ? Math.floor((Date.parse(ts) - startMs) / COL_MS) : null)
  const episodes: RecordEpisode[] = []
  for (const e of log) {
    if (e.type !== "complication") continue
    const from = colOf(e.ts)
    if (from == null) continue
    const to = colOf(e.endTs) ?? from
    episodes.push({ fromCol: from, toCol: Math.max(from, to), label: clinicalDisplayLabel("complication", String(e.label ?? ""), lang, { label: String(e.label ?? "") }) })
  }

  const flags = events.filter(e => e.label && e.kind !== "complication").map(e => ({ col: e.colIdx, label: String(e.label) }))
  const points: RecordVitalPoint[] = vitals
    .map((v, col) => ({ col, systolic: v.systolic, diastolic: v.diastolic, heartRate: v.heartRate, spO2: v.spO2, etco2: v.etco2, temp: v.temp }))
    .filter(v => [v.systolic, v.diastolic, v.heartRate, v.spO2, v.etco2, v.temp].some(finite))

  return { firstCol: 0, lastCol, vitals: points, lanes, episodes, flags, time }
}
