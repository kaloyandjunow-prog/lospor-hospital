import { INTRAOP_COLUMN_MINUTES } from "./intraop-engine"

// Pure model for the read-only case-summary timetable card.
//
// The /api/cases/[id] response carries intraop.keyEvents = the WEB-projected
// timetable blob (vitals/drugs/agents/infusions/fluids/gasSettings/
// clinicalEvents/positions + raw log). This normalizes that blob into a small
// render model so the SVG component stays dumb and the logic stays testable.
// No react / react-native imports here.

export type ProjectedVital = { systolic?: number; diastolic?: number; heartRate?: number; spO2?: number; etco2?: number; temp?: number }
export type ProjectedSeg   = { startCol?: number; endCol?: number }

export type ProjectedTimetable = {
  vitals?: ProjectedVital[]
  drugs?: { colIdx?: number; name?: string; dose?: string; unit?: string }[]
  agents?: (ProjectedSeg & { name?: string; percent?: number })[]
  infusions?: (ProjectedSeg & { name?: string; rate?: number | string; unit?: string })[]
  gasSettings?: (ProjectedSeg & { fgf?: number; carrierGas?: string | null; fio2?: number })[]
  fluids?: (ProjectedSeg & { name?: string; volume?: string })[]
  clinicalEvents?: { colIdx?: number; label?: string }[]
  positions?: (ProjectedSeg & { position?: string })[]
  [k: string]: unknown
}

export type SummaryLaneKind = "agent" | "infusion" | "gas" | "fluid" | "position"

export type SummaryLane = {
  kind: SummaryLaneKind
  label: string
  color: string
  segments: { startCol: number; endCol: number; text: string; code?: string }[]
}

export type SummaryTimetableModel = {
  nCols: number
  vitals: ProjectedVital[]
  events: { col: number; label: string }[]
  /** Time-sorted; `n` matches the printed record's numbered drug log (① ② …). */
  drugTicks: { col: number; name: string; n: number }[]
  lanes: SummaryLane[]
  hasData: boolean
}

export function colToHHMM(col: number, startISO?: string | null): string {
  if (!startISO) return `+${col * INTRAOP_COLUMN_MINUTES}m`
  const d = new Date(startISO)
  // DB times are UTC-encoded wall-clock; UTC getters recover the entered time.
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes() + col * INTRAOP_COLUMN_MINUTES
  return `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`
}

// Numbered drug administration log — same colIdx-sorted numbering as the
// printed record's log box and the chart pins.
export type DrugLogEntry = { n: number; col: number; time: string; name: string; dose: string }
export function buildDrugLogEntries(kev: unknown, startISO?: string | null): DrugLogEntry[] {
  const t: ProjectedTimetable = (kev && typeof kev === "object" && !Array.isArray(kev)) ? kev as ProjectedTimetable : {}
  const drugs = Array.isArray(t.drugs) ? t.drugs : []
  return drugs
    .slice()
    .sort((a, b) => (a.colIdx ?? 0) - (b.colIdx ?? 0))
    .map((d, i) => ({
      n: i + 1,
      col: d.colIdx ?? 0,
      time: colToHHMM(d.colIdx ?? 0, startISO),
      name: String(d.name ?? ""),
      dose: `${d.dose ?? ""} ${d.unit ?? ""}`.trim(),
    }))
}

// ── Semantic zoom (finished-case viewer) ─────────────────────────────────────
// colW = pixels per timetable column. The numeric-grid sampling step follows
// the zoom: wide columns → q5 detail, narrow columns → coarse q15/q30 like the
// printed record. Traces/pins/events/lanes are never thinned by zoom.
export const MIN_COL_W = 6
export const MAX_COL_W = 44
/** Px a "118/72" numeric cell needs to stay legible. */
const CELL_PX = 40

export function clampColW(v: number): number {
  if (!Number.isFinite(v)) return MIN_COL_W
  return Math.min(MAX_COL_W, Math.max(MIN_COL_W, Math.round(v)))
}

/** Smallest sampling step (in timetable columns) that keeps numeric cells legible. */
export function stepForColW(colW: number): 1 | 2 | 3 | 4 | 6 {
  for (const step of [1, 2, 3, 4, 6] as const) {
    if (colW * step >= CELL_PX) return step
  }
  return 6
}

const LANE_COLORS = {
  agent:    "#0d9488",
  infusion: "#2563eb",
  gas:      "#0284c7",
  fluid:    "#0ea5e9",
  position: "#475569",
}

function segEnd(s: ProjectedSeg): number { return s.endCol ?? s.startCol ?? 0 }

// Lane labels sit in a narrow left gutter, so the Bulgarian ones stay short —
// the same abbreviations used on the printed record.
export const LANE_LABELS = {
  en: { agent: "Agent", infusion: "Inf",  gas: "Gas",         fluid: "Fluid",  position: "Pos" },
  bg: { agent: "Агент", infusion: "Инф",  gas: "Газова смес", fluid: "Флуиди", position: "Позиция" },
} as const

export function buildSummaryTimetableModel(kev: unknown, lang: "en" | "bg" = "en"): SummaryTimetableModel {
  const L = LANE_LABELS[lang] ?? LANE_LABELS.en
  const t: ProjectedTimetable = (kev && typeof kev === "object" && !Array.isArray(kev)) ? kev as ProjectedTimetable : {}
  const vitals    = Array.isArray(t.vitals) ? t.vitals : []
  const drugs     = Array.isArray(t.drugs) ? t.drugs : []
  const agents    = Array.isArray(t.agents) ? t.agents : []
  const infusions = Array.isArray(t.infusions) ? t.infusions : []
  const gas       = Array.isArray(t.gasSettings) ? t.gasSettings : []
  const fluids    = Array.isArray(t.fluids) ? t.fluids : []
  const events    = Array.isArray(t.clinicalEvents) ? t.clinicalEvents : []
  const positions = Array.isArray(t.positions) ? t.positions : []

  const nCols = Math.max(
    vitals.length,
    drugs.length     ? Math.max(...drugs.map(d => d.colIdx ?? 0)) + 1 : 0,
    agents.length    ? Math.max(...agents.map(segEnd)) + 1 : 0,
    infusions.length ? Math.max(...infusions.map(segEnd)) + 1 : 0,
    gas.length       ? Math.max(...gas.map(segEnd)) + 1 : 0,
    fluids.length    ? Math.max(...fluids.map(segEnd)) + 1 : 0,
    events.length    ? Math.max(...events.map(e => e.colIdx ?? 0)) + 1 : 0,
    positions.length ? Math.max(...positions.map(segEnd)) + 1 : 0,
    12,
  ) + 1

  const lanes: SummaryLane[] = []
  if (agents.length) lanes.push({
    kind: "agent", label: L.agent, color: LANE_COLORS.agent,
    segments: agents.map(a => ({ startCol: a.startCol ?? 0, endCol: segEnd(a), text: `${a.name ?? ""}${a.percent != null ? ` ${a.percent}%` : ""}`.trim(), code: a.name })),
  })
  if (infusions.length) lanes.push({
    kind: "infusion", label: L.infusion, color: LANE_COLORS.infusion,
    segments: infusions.map(f => ({ startCol: f.startCol ?? 0, endCol: segEnd(f), text: `${f.name ?? ""} ${f.rate ?? ""}${f.unit ? ` ${f.unit}` : ""}`.trim(), code: f.name })),
  })
  if (gas.length) lanes.push({
    kind: "gas", label: L.gas, color: LANE_COLORS.gas,
    segments: gas.map(g => {
      const carrierCode = String(g.carrierGas ?? "").toLowerCase()
      const carrier = carrierCode === "n2o" ? "N₂O" : carrierCode === "air" ? "Air" : null
      const parts = [carrier ? `O₂/${carrier}` : "O₂"]
      if (g.fgf != null) parts.push(`FGF ${g.fgf} L/min`)
      if (g.fio2 != null) parts.push(`FiO₂ ${g.fio2}%`)
      return { startCol: g.startCol ?? 0, endCol: segEnd(g), text: parts.join(" · "), code: carrierCode || "o2" }
    }),
  })
  if (fluids.length) lanes.push({
    kind: "fluid", label: L.fluid, color: LANE_COLORS.fluid,
    segments: fluids.map(f => ({ startCol: f.startCol ?? 0, endCol: segEnd(f), text: `${f.name ?? ""}${f.volume ? ` ${f.volume} mL` : ""}`.trim(), code: f.name })),
  })
  if (positions.length) lanes.push({
    kind: "position", label: L.position, color: LANE_COLORS.position,
    segments: positions.map(p => ({ startCol: p.startCol ?? 0, endCol: segEnd(p), text: String(p.position ?? ""), code: p.position })),
  })

  return {
    nCols,
    vitals,
    events: events.filter(e => e.label).map(e => ({ col: e.colIdx ?? 0, label: String(e.label) })),
    drugTicks: drugs
      .slice()
      .sort((a, b) => (a.colIdx ?? 0) - (b.colIdx ?? 0))
      .map((d, i) => ({ col: d.colIdx ?? 0, name: String(d.name ?? ""), n: i + 1 })),
    lanes,
    hasData: !!(vitals.length || drugs.length || agents.length || infusions.length || fluids.length || gas.length),
  }
}
