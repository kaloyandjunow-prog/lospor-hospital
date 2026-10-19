import type {
  GasSettingsSegment,
  LogEvent,
  NumericText,
  TimetableData,
  TimetableFluid,
  TimetableInfusion,
  VitalsEntry,
} from "./intraop-types"
import { INTRAOP_COLUMN_MINUTES } from "./intraop-engine"
import { localTimeOf } from "./intraop-time"
import { segmentEventIds } from "./intraop-save-state"
import { POSITIONS } from "./catalog/position"
import { tciPointsUpTo, tciPrediction, type TciModel, type TciPatient, type TciSite } from "./tci"

export type DrugTotal = {
  name: string
  unit: string
  total: number
  /** How many separate doses were summed — "3 × 2 mg" reads differently from one 6 mg dose. */
  count: number
}

export type DrugLogEntry = {
  column: number
  time: string
  name: string
  dose: string
  unit: string
}

/**
 * How an item shows in a row (1.4.9). `planned`: a future-dated start, drawn
 * as a marker in its own row and not yet given. `plannedStop`: the row a
 * future-dated stop falls in, past the running bar. Neither is running.
 * `plannedChange` (9.13.0): a rate or setting change dated after now, shown
 * with its new value in its own row and applied to nothing yet.
 * `stopUnconfirmed` (9.13.0): the row a stop entered ahead of its time
 * reached, asked about until someone confirms it or says it is still running.
 */
export type RunningItemMarks = {
  planned?: true
  plannedStop?: true
  plannedChange?: true
  /**
   * A row after "now" that the item, running now, will still be running in
   * (9.13.1): drawn dashed, and a control -- a change or stop made from it is
   * dated to that row, and so is planned.
   */
  projected?: true
  stopUnconfirmed?: true
  /** With `stopUnconfirmed`: the stop to confirm or withdraw. */
  stopEventId?: string
  /** The events the drawn item came from, so a row can say which are not yet saved (9.13.0). */
  eventIds?: string[]
}

export type RunningItem = RunningItemMarks & (
  | { kind: "agent"; id: string; name: string; color: string }
  | { kind: "gas"; id: string; fgf: number; fio2: number; color: string }
  | {
      kind: "infusion"; id: string; name: string; rate: NumericText; unit: string; color: string
      /** A TCI infusion: its model and site, and the predicted Cp or Ce at the row's end (2026-10-18). */
      tci?: { model: TciModel; site: TciSite; predicted?: number }
    }
  | {
      kind: "fluid"
      id: string
      name: string
      volume: string
      color: string
      fluidEntryMode?: "VOLUME" | "RATE"
      rate?: NumericText
      unit?: string
    }
)

type MarkableSegment = { startCol: number; endCol: number; stopped?: boolean; planned?: boolean; plannedStopCol?: number; stopUnconfirmed?: boolean; stopEventId?: string }

/**
 * Whether an item running now is still running at a later row (9.13.1): it has
 * started, has not stopped, and has no planned stop at or before that row. A
 * running bar is drawn only to "now", so a row after it showed nothing to
 * change: a rate change for 15:55 could only be entered as a second infusion
 * of the same drug, which then counted alongside the first. One rule for the
 * PWA's rows and the web's lanes.
 */
export function runsOnAt(segment: MarkableSegment, column: number): boolean {
  return !segment.planned && !segment.stopped && column > segment.endCol
    && (segment.plannedStopCol == null || column < segment.plannedStopCol)
}

/**
 * How a segment shows in a column, or null when it does not show there.
 * `project`: the live chart also shows a running item in the rows after now.
 */
function rowMarks(segment: MarkableSegment, column: number, project = false): RunningItemMarks | null {
  if (segment.planned) return column === segment.startCol ? { planned: true } : null
  if (column >= segment.startCol && column <= segment.endCol) {
    return segment.stopUnconfirmed && column === segment.endCol
      ? { stopUnconfirmed: true, ...(segment.stopEventId ? { stopEventId: segment.stopEventId } : {}) }
      : {}
  }
  if (segment.plannedStopCol != null && column === segment.plannedStopCol && column > segment.endCol) {
    return { plannedStop: true }
  }
  if (project && runsOnAt(segment, column)) return { projected: true }
  return null
}

export type RowSummary = {
  criticalParts: string[]
  normalParts: string[]
  eventParts: string[]
  hasCritical: boolean
  hasUnsynced: boolean
}

export type EffectiveGasSettings = {
  fgf: number
  carrierGas: string | null
  fio2: number
  fiAir?: number
  fiN2O?: number
  changeCol: number | null
}

export type GasDisplaySettings = {
  fgf: number
  carrierGas: string | null
  fio2: number
  fiAir?: number
  fiN2O?: number
}

export type SemanticEventDescriptor = {
  key: string
  text: string
  color: string
  sub?: string
}

export type EventDescriptorOptions = {
  /** The reader's language for the fixed words of the log (2026-10-18); English by default. */
  language?: string
  /** A drug's category in the reader's language (the apps' own group labels). */
  drugCategoryLabel?: (category: string) => string
  drugColor?: (name: string) => string
  clinicalEventColor?: (label: string) => string
  previousVital?: SemanticLogEvent
  trend?: (current: number, previous: number | undefined) => string
}

export type SemanticLogEvent = Omit<Partial<LogEvent>, "type"> & { type?: string }

function gasFraction(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback
}

export function formatGasMixLabel(settings: GasDisplaySettings): string {
  const fio2 = gasFraction(settings.fio2, 100)
  if (settings.carrierGas === "air") {
    return `O2/Air ${fio2}/${gasFraction(settings.fiAir, 100 - fio2)}`
  }
  if (settings.carrierGas === "n2o") {
    return `O2/N2O ${fio2}/${gasFraction(settings.fiN2O, 100 - fio2)}`
  }
  return `O2 ${fio2}%`
}

export function formatGasSettingsLabel(settings: GasDisplaySettings): string {
  return `FGF ${settings.fgf} L/min \u00b7 ${formatGasMixLabel(settings)}`
}

/** Splits FiO2 into the complementary carrier fraction and clamps it to a real range. */
export function normalizeGasSettings(
  fgf: number,
  carrierGas: string | null,
  fio2: number,
): GasDisplaySettings {
  const safeFio2 = carrierGas == null ? 100 : Math.min(100, Math.max(21, fio2))
  return {
    fgf,
    carrierGas,
    fio2: safeFio2,
    fiAir: carrierGas === "air" ? 100 - safeFio2 : 0,
    fiN2O: carrierGas === "n2o" ? 100 - safeFio2 : 0,
  }
}

/**
 * Vital-sign abbreviations on screen (2026-10-18): Bulgarian screens use the
 * printed record's АН / СЧ / ДЧ / Темп.; SpO₂ and EtCO₂ read the same in both.
 */
export const VITAL_ABBREVIATIONS = {
  en: { bp: "BP", hr: "HR", rr: "RR", temp: "Temp", tempShort: "T", sbp: "SBP", dbp: "DBP", perMinute: "/min", bpm: "bpm" },
  bg: { bp: "АН", hr: "СЧ", rr: "ДЧ", temp: "Темп.", tempShort: "Т", sbp: "САН", dbp: "ДАН", perMinute: "/мин", bpm: "уд/мин" },
} as const

export function vitalAbbreviations(language?: string | null): (typeof VITAL_ABBREVIATIONS)["en" | "bg"] {
  return VITAL_ABBREVIATIONS[language?.toLowerCase().startsWith("bg") ? "bg" : "en"]
}

// The log's fixed words. Names (drugs, fluids, agents) and standard
// abbreviations stay as recorded; the words around them follow the reader.
const EVENT_WORDS = {
  en: {
    event: "Event", infusion: "Infusion", infusionStarted: "Infusion started", rateChanged: "Rate changed",
    stopped: (name: string) => `${name} stopped`, fluid: "Fluid", fluidRateStarted: "Fluid rate started",
    fluidRateChanged: "Fluid rate changed", complete: (name: string) => `${name} complete`, agent: "Agent",
    on: (name: string) => `${name} on`, off: (name: string) => `${name} off`, volatile: "Volatile",
    gasStarted: "Gas settings started", gasChanged: "Gas settings changed", gasStopped: "Gas settings stopped",
    gasSettings: "Gas settings", positionChanged: "Position changed", position: "Position",
    phaseChanged: "Phase changed", casePhase: "Case phase",
  },
  bg: {
    event: "Събитие", infusion: "Инфузия", infusionStarted: "Начало на инфузия", rateChanged: "Промяна на скоростта",
    stopped: (name: string) => `${name} — спряна`, fluid: "Течност", fluidRateStarted: "Начало на вливане със скорост",
    fluidRateChanged: "Промяна на скоростта на течност", complete: (name: string) => `${name} — вливането приключи`, agent: "Анестетик",
    on: (name: string) => `${name} — включен`, off: (name: string) => `${name} — изключен`, volatile: "Инхалационен анестетик",
    gasStarted: "Свеж газ — начало", gasChanged: "Свеж газ — промяна", gasStopped: "Свеж газ — спрян",
    gasSettings: "Свеж газ", positionChanged: "Промяна на позицията", position: "Позиция",
    phaseChanged: "Промяна на етапа", casePhase: "Етап",
  },
} as const

// Case phases, recorded on older charts only (no screen offers them now).
const PHASE_NAMES_BG: Readonly<Record<string, string>> = {
  induction: "Увод", maintenance: "Поддържане", emergence: "Събуждане", recovery: "Възстановяване",
}

function phaseName(value: string | undefined, language: "en" | "bg"): string | undefined {
  if (!value || language !== "bg") return value
  return PHASE_NAMES_BG[value.toLowerCase()] ?? value
}

function positionName(value: string | undefined, language: "en" | "bg"): string | undefined {
  if (!value) return undefined
  const entry = POSITIONS.find(position => position.v === value || position.label === value)
  return entry ? (language === "bg" ? entry.labelBg : entry.label) : value
}

export function describeIntraopEvent(
  event: SemanticLogEvent,
  options: EventDescriptorOptions = {},
): SemanticEventDescriptor {
  const language = options.language?.toLowerCase().startsWith("bg") ? "bg" : "en"
  const w = EVENT_WORDS[language]
  switch (event.type) {
    case "drug":
      return {
        key: "drug",
        text: `${event.name ?? ""} ${event.dose ?? ""} ${event.unit ?? ""}`.trim(),
        color: event.color ?? options.drugColor?.(event.name ?? "") ?? "#3b82f6",
        ...(event.category ? { sub: options.drugCategoryLabel?.(event.category) ?? event.category } : {}),
      }
    case "vital": {
      const parts: string[] = []
      const previous = options.previousVital
      const trend = (current: number, prior: number | undefined) =>
        options.trend?.(current, prior) ?? ""
      if (event.systolic != null && event.diastolic != null) {
        parts.push(
          `${vitalAbbreviations(language).bp} ${event.systolic}${trend(event.systolic, previous?.systolic)}/${event.diastolic}`,
        )
      }
      if (event.heartRate != null) {
        parts.push(`${vitalAbbreviations(language).hr} ${event.heartRate}${trend(event.heartRate, previous?.heartRate)}`)
      }
      if (event.spO2 != null) {
        parts.push(`SpO2 ${event.spO2}%${trend(event.spO2, previous?.spO2)}`)
      }
      if (event.etco2 != null) {
        parts.push(`EtCO2 ${event.etco2}${trend(event.etco2, previous?.etco2)}`)
      }
      if (event.temp != null) parts.push(`${event.temp}\u00b0C`)
      if (event.bis != null) parts.push(`BIS ${event.bis}`)
      if (event.tofRatio != null) parts.push(`TOF ${event.tofRatio}`)
      if (event.cvp != null) parts.push(`CVP ${event.cvp} mmHg`)
      return { key: "vital", text: parts.join("  "), color: "#22c55e" }
    }
    case "clinical_event": {
      const label = event.label ?? w.event
      return {
        key: "clinical_event",
        text: label,
        color: event.color
          ?? options.clinicalEventColor?.(label.split(" (")[0])
          ?? "#6366f1",
      }
    }
    case "infusion_start":
      return {
        key: "infusion_started",
        text: `${event.name ?? ""} ${event.rate ?? ""} ${event.unit ?? ""}`.trim(),
        color: event.color ?? "#6366f1",
        sub: w.infusionStarted,
      }
    case "infusion_rate":
      return {
        key: "infusion_rate_changed",
        text: `${event.name ?? ""} \u2192 ${event.rate ?? ""} ${event.unit ?? ""}`.trim(),
        color: event.color ?? "#6366f1",
        sub: w.rateChanged,
      }
    case "infusion_stop":
      return {
        key: "infusion_stopped",
        text: w.stopped(event.name ?? w.infusion),
        color: "#64748b",
        sub: w.infusion,
      }
    case "fluid_start":
      if (event.fluidEntryMode === "RATE") {
        return {
          key: "fluid_started",
          text: `${event.name ?? ""} ${event.rate ?? ""} ${event.unit ?? "mL/h"}`.trim(),
          color: event.color ?? "#06b6d4",
          sub: w.fluidRateStarted,
        }
      }
      return {
        key: "fluid_started",
        text: `${event.name ?? ""} ${event.bagVolumeMl ?? event.volume ?? ""} mL`.trim(),
        color: event.color ?? "#06b6d4",
        sub: w.fluid,
      }
    case "fluid_rate":
      return {
        key: "fluid_rate_changed",
        text: `${event.name ?? w.fluid} → ${event.rate ?? ""} ${event.unit ?? "mL/h"}`.trim(),
        color: event.color ?? "#06b6d4",
        sub: w.fluidRateChanged,
      }
    case "fluid_end":
      return {
        key: "fluid_completed",
        text: event.administeredVolumeMl != null
          ? `${w.complete(event.name ?? w.fluid)} · ${event.administeredVolumeMl} mL`
          : w.complete(event.name ?? w.fluid),
        color: "#64748b",
        sub: w.fluid,
      }
    case "agent_start":
      return {
        key: "agent_started",
        text: event.value ? `${event.name ?? w.agent} ${event.value}%` : w.on(event.name ?? w.agent),
        color: event.color ?? "#a855f7",
        sub: w.volatile,
      }
    case "agent_stop":
      return {
        key: "agent_stopped",
        text: w.off(event.name ?? w.agent),
        color: "#64748b",
        sub: w.volatile,
      }
    case "gas_start":
    case "gas_change":
      return {
        key: event.type === "gas_start" ? "gas_started" : "gas_changed",
        text: formatGasSettingsLabel({
          fgf: Number(event.fgf ?? 0),
          carrierGas: event.carrierGas ?? null,
          fio2: Number(event.fio2 ?? 100),
          fiAir: event.fiAir,
          fiN2O: event.fiN2O,
        }),
        color: "#6366f1",
        sub: event.type === "gas_start" ? w.gasStarted : w.gasChanged,
      }
    case "gas_stop":
      return {
        key: "gas_stopped",
        text: w.gasStopped,
        color: "#64748b",
        sub: w.gasSettings,
      }
    case "position_change":
      return {
        key: "position_changed",
        // The position is recorded in `name` (the engine writes it there); the
        // log named only "Position changed" before 2026-10-18.
        text: positionName(event.label ?? event.value ?? event.name, language) ?? w.positionChanged,
        color: event.color ?? "#0ea5e9",
        sub: w.position,
      }
    case "phase_change":
      return {
        key: "phase_changed",
        text: phaseName(event.label ?? event.value ?? event.name, language) ?? w.phaseChanged,
        color: event.color ?? "#64748b",
        sub: w.casePhase,
      }
    default:
      return {
        key: "event",
        text: event.label ?? event.type ?? w.event,
        color: event.color ?? "#64748b",
      }
  }
}

export function gasSettingsAtColumn(
  segment: GasSettingsSegment,
  column: number,
  options: { projected?: boolean } = {},
): EffectiveGasSettings | null {
  if (column < segment.startCol || (!options.projected && column > segment.endCol)) return null
  let latest: NonNullable<GasSettingsSegment["settingsChanges"]>[number] | undefined
  // A planned change is drawn but not yet in force (9.13.0) -- except in a
  // projected row after now, by when it will be (9.13.1).
  for (const change of (segment.settingsChanges ?? []).filter(item => options.projected || !item.planned)) {
    if (change.col <= column && (!latest || change.col >= latest.col)) latest = change
  }
  const carrierGas = latest?.carrierGas ?? segment.carrierGas
  const fio2 = latest?.fio2 ?? segment.fio2
  const explicitFiAir = latest ? latest.fiAir : segment.fiAir
  const explicitFiN2O = latest ? latest.fiN2O : segment.fiN2O
  return {
    fgf: latest?.fgf ?? segment.fgf,
    carrierGas,
    fio2,
    fiAir: explicitFiAir ?? (carrierGas === "air" ? 100 - fio2 : 0),
    fiN2O: explicitFiN2O ?? (carrierGas === "n2o" ? 100 - fio2 : 0),
    changeCol: latest?.col ?? null,
  }
}

function numeric(value: NumericText | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function calculateDrugTotals(
  timetable: Pick<TimetableData, "drugs"> | null | undefined,
): DrugTotal[] {
  const totals = new Map<string, DrugTotal>()
  for (const drug of timetable?.drugs ?? []) {
    const key = `${drug.name}\u0000${drug.unit}`
    const existing = totals.get(key) ?? { name: drug.name, unit: drug.unit, total: 0, count: 0 }
    existing.total += numeric(drug.dose)
    existing.count += 1
    totals.set(key, existing)
  }
  return [...totals.values()].map(total => ({
    ...total,
    total: Math.round(total.total * 1000) / 1000,
  }))
}

export function rateAtColumn(
  infusion: TimetableInfusion,
  column: number,
): { rate: NumericText; unit: string } {
  const latest = (infusion.rateChanges ?? [])
    .filter(change => !change.planned && change.col <= column)
    .sort((a, b) => b.col - a.col)[0]
  return {
    rate: latest?.rate ?? infusion.rate,
    unit: latest?.unit ?? infusion.unit,
  }
}

export function fluidRateAtColumn(
  fluid: TimetableFluid,
  column: number,
  options: { projected?: boolean } = {},
): { rate: NumericText | undefined; unit: string | undefined } {
  if (fluid.fluidEntryMode !== "RATE") return { rate: undefined, unit: undefined }
  let rate = fluid.rate
  let unit = fluid.unit ?? "mL/h"
  for (const change of [...(fluid.rateChanges ?? [])].filter(item => options.projected || !item.planned).sort((a, b) => a.col - b.col)) {
    if (change.col > column) break
    rate = change.rate
    unit = change.unit
  }
  return { rate, unit }
}

/**
 * `projectRunning` (the live chart of a case not yet ended): items running
 * now also show, marked `projected`, in later rows up to their planned stop.
 * Never for a record, a summary or an ended case -- an item continued into
 * recovery does not run on in the chart after the end.
 */
export type RunningItemsOptions = {
  projectRunning?: boolean
  /** The patient a TCI infusion's prediction is worked out for. */
  tciPatient?: TciPatient | null
}

/** A TCI infusion's predicted concentration (at its site) at the end of each column it covers. */
function tciPredictedByColumn(infusion: TimetableData["infusions"][number], patient: TciPatient | null | undefined): Map<number, number> {
  const out = new Map<number, number>()
  if (!infusion.tciModel || !patient || !infusion.startTs || infusion.planned) return out
  const columnMs = INTRAOP_COLUMN_MINUTES * 60_000
  const startMs = Date.parse(infusion.startTs)
  const firstColumn = Math.floor(startMs / columnMs) * columnMs
  const lastEnd = firstColumn + (infusion.endCol - infusion.startCol + 1) * columnMs
  const endMs = infusion.endTs ? Date.parse(infusion.endTs) : lastEnd
  const changes = [
    { atMs: startMs, target: Number(infusion.rate) || 0 },
    ...(infusion.rateChanges ?? []).filter(change => !change.planned && change.ts).map(change => ({ atMs: Date.parse(change.ts!), target: Number(change.rate) || 0 })),
  ].filter(change => change.atMs <= endMs)
  const points = tciPrediction({ ...infusion, tciModel: infusion.tciModel }, changes, endMs, patient)
  if (!points.length) return out
  for (let column = infusion.startCol; column <= infusion.endCol; column += 1) {
    const at = Math.min(firstColumn + (column - infusion.startCol + 1) * columnMs, endMs)
    const point = points[Math.max(0, tciPointsUpTo(points, at) - 1)]
    const value = infusion.tciSite === "PLASMA" ? point.cp : point.ce
    out.set(column, Number(value.toPrecision(2)))
  }
  return out
}

export function runningItemsAt(
  timetable: TimetableData,
  column: number,
  options: RunningItemsOptions = {},
): RunningItem[] {
  return runningItemsByColumn(timetable, [column], options).get(column) ?? []
}

export function runningItemsByColumn(
  timetable: TimetableData,
  columns: number[],
  options: RunningItemsOptions = {},
): Map<number, RunningItem[]> {
  const project = options.projectRunning === true
  const rows = new Map(columns.map(column => [column, [] as RunningItem[]]))
  const push = (column: number, item: RunningItem) => {
    rows.get(column)?.push(item)
  }

  for (const agent of timetable.agents) {
    for (const column of columns) {
      const marks = rowMarks(agent, column, project)
      if (!marks) continue
      push(column, {
        kind: "agent",
        id: `agent-${agent.name}`,
        name: agent.name,
        color: agent.color ?? "#a78bfa",
        eventIds: segmentEventIds(agent),
        ...marks,
      })
    }
  }

  for (const gas of timetable.gasSettings ?? []) {
    for (const column of columns) {
      const marks = rowMarks(gas, column, project)
      if (!marks) continue
      const settings = marks.projected
        ? gasSettingsAtColumn(gas, column, { projected: true })
        : gasSettingsAtColumn(gas, Math.min(column, gas.endCol))
      if (!settings) continue
      push(column, {
        kind: "gas",
        id: gas.id || "gas-settings",
        fgf: settings.fgf,
        fio2: settings.fio2,
        color: "#818cf8",
        eventIds: segmentEventIds(gas),
        ...marks,
      })
    }
    for (const change of gas.settingsChanges ?? []) {
      if (!change.planned || !rows.has(change.col)) continue
      push(change.col, {
        kind: "gas",
        id: `${gas.id || "gas-settings"}-change-${change.eventId ?? change.col}`,
        fgf: change.fgf,
        fio2: change.fio2,
        color: "#818cf8",
        plannedChange: true,
      })
    }
  }

  for (const infusion of timetable.infusions) {
    const predicted = tciPredictedByColumn(infusion, options.tciPatient)
    const allChanges = [...(infusion.rateChanges ?? [])].sort((a, b) => a.col - b.col)
    const inForce = allChanges.filter(change => !change.planned)
    for (const column of columns) {
      const marks = rowMarks(infusion, column, project)
      if (!marks) continue
      // In a projected row, a planned change due by then will be in force.
      const changes = marks.projected ? allChanges : inForce
      let latest = changes[0]?.col <= column ? changes[0] : undefined
      for (let index = 1; index < changes.length; index += 1) {
        if (changes[index].col > column) break
        latest = changes[index]
      }
      push(column, {
        kind: "infusion",
        id: `inf-${infusion.id}`,
        name: infusion.name,
        rate: latest?.rate ?? infusion.rate,
        unit: latest?.unit ?? infusion.unit,
        color: infusion.color ?? "#3b82f6",
        eventIds: segmentEventIds(infusion),
        ...(infusion.tciModel ? { tci: { model: infusion.tciModel, site: infusion.tciSite ?? "EFFECT", ...(predicted.has(column) ? { predicted: predicted.get(column) } : {}) } } : {}),
        ...marks,
      })
    }
    for (const change of infusion.rateChanges ?? []) {
      if (!change.planned || !rows.has(change.col)) continue
      push(change.col, {
        kind: "infusion",
        id: `inf-${infusion.id}-change-${change.eventId ?? change.col}`,
        name: infusion.name,
        rate: change.rate,
        unit: change.unit,
        color: infusion.color ?? "#3b82f6",
        plannedChange: true,
      })
    }
  }

  for (const fluid of timetable.fluids) {
    for (const column of columns) {
      const marks = rowMarks(fluid, column, project)
      if (!marks) continue
      const activeRate = fluidRateAtColumn(fluid, column, { projected: !!marks.projected })
      push(column, {
        kind: "fluid",
        id: `fluid-${fluid.id}`,
        name: fluid.name,
        volume: fluid.volume,
        color: fluid.color ?? "#38bdf8",
        fluidEntryMode: fluid.fluidEntryMode,
        rate: activeRate.rate,
        unit: activeRate.unit,
        eventIds: segmentEventIds(fluid),
        ...marks,
      })
    }
    for (const change of fluid.rateChanges ?? []) {
      if (!change.planned || !rows.has(change.col)) continue
      push(change.col, {
        kind: "fluid",
        id: `fluid-${fluid.id}-change-${change.eventId ?? change.col}`,
        name: fluid.name,
        volume: fluid.volume,
        color: fluid.color ?? "#38bdf8",
        fluidEntryMode: fluid.fluidEntryMode,
        rate: change.rate,
        unit: change.unit,
        plannedChange: true,
      })
    }
  }

  return rows
}

export function formatColumnTime(
  column: number,
  start: Date | string | number | null | undefined,
  intervalMinutes = INTRAOP_COLUMN_MINUTES,
  clock: "local" | "utc" = "local",
): string {
  if (start == null) return `+${column * intervalMinutes}m`
  const rawMs = start instanceof Date ? start.getTime() : new Date(start).getTime()
  if (!Number.isFinite(rawMs)) return `+${column * intervalMinutes}m`
  // From the five-minute row the start falls in, as the grid is (9.13.0).
  const columnMs = INTRAOP_COLUMN_MINUTES * 60_000
  const startMs = Math.floor(rawMs / columnMs) * columnMs
  const date = new Date(startMs + column * intervalMinutes * 60_000)
  const hours = clock === "utc" ? date.getUTCHours() : date.getHours()
  const minutes = clock === "utc" ? date.getUTCMinutes() : date.getMinutes()
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

/**
 * Each event's own time of day in the case's time zone, by event id -- never
 * the machine's zone, which on a hosted server is not the hospital's.
 */
export function eventClockTimes(log: readonly unknown[], timeZone?: string | null): Map<string, string> {
  const times = new Map<string, string>()
  if (!timeZone) return times
  for (const item of log) {
    const event = item as { id?: unknown; ts?: unknown }
    if (typeof event?.id !== "string" || typeof event.ts !== "string") continue
    const time = localTimeOf(new Date(event.ts), timeZone)
    if (time) times.set(event.id, time)
  }
  return times
}

export function buildDrugLogEntries(
  timetable: Pick<TimetableData, "drugs">,
  start?: Date | string | number | null,
  clock: "local" | "utc" = "local",
  exactTimes?: Map<string, string>,
): DrugLogEntry[] {
  return [...timetable.drugs]
    .sort((a, b) => a.colIdx - b.colIdx)
    .map(drug => ({
      column: drug.colIdx,
      time: (drug.eventId ? exactTimes?.get(drug.eventId) : undefined)
        ?? formatColumnTime(drug.colIdx, start, INTRAOP_COLUMN_MINUTES, clock),
      name: drug.name,
      dose: drug.dose,
      unit: drug.unit,
    }))
}

export function naturalTimetableColumnCount(
  timetable: Partial<TimetableData>,
  minimumColumns = 0,
  trailingColumns = 0,
): number {
  const columns = [0]
  for (const [column, vital] of (timetable.vitals ?? []).entries()) {
    if (vital && Object.values(vital).some(value => value != null)) columns.push(column)
  }
  for (const drug of timetable.drugs ?? []) columns.push(drug.colIdx)
  for (const event of timetable.clinicalEvents ?? []) columns.push(event.colIdx)
  for (const segment of [
    ...(timetable.infusions ?? []),
    ...(timetable.fluids ?? []),
    ...(timetable.agents ?? []),
    ...(timetable.gasSettings ?? []),
    ...(timetable.positions ?? []),
    ...(timetable.phases ?? []),
  ]) {
    columns.push(segment.startCol, segment.endCol)
  }
  return Math.max(Math.max(...columns) + 1, minimumColumns) + trailingColumns
}

export function vitalSummaryParts(vital?: VitalsEntry, language?: string): string[] {
  if (!vital) return []
  const a = vitalAbbreviations(language)
  const parts: string[] = []
  if (vital.systolic != null && vital.diastolic != null) {
    parts.push(`${vital.systolic}/${vital.diastolic}`)
  }
  if (vital.heartRate != null) parts.push(`${a.hr} ${vital.heartRate}`)
  if (vital.spO2 != null) parts.push(`SpO2 ${vital.spO2}`)
  if (vital.etco2 != null) parts.push(`CO2 ${vital.etco2}`)
  if (vital.temp != null) parts.push(`${a.tempShort} ${vital.temp}\u00b0C`)
  if (vital.bis != null) parts.push(`BIS ${vital.bis}`)
  if (vital.tofRatio != null) parts.push(`TOF ${vital.tofRatio}`)
  if (vital.cvp != null) parts.push(`CVP ${vital.cvp}`)
  return parts
}

export function buildRowSummary(
  vital: VitalsEntry | undefined,
  rowEvents: LogEvent[],
  labelOf: (event: LogEvent) => string,
  language?: string,
): RowSummary {
  const a = vitalAbbreviations(language)
  const criticalParts: string[] = []
  const normalParts: string[] = []
  if (vital?.systolic != null) {
    const value = `${a.bp} ${vital.systolic}/${vital.diastolic ?? "?"}`
    ;(vital.systolic < 90 ? criticalParts : normalParts).push(value)
  }
  if (vital?.heartRate != null) {
    const value = `${a.hr} ${vital.heartRate}`
    ;(vital.heartRate < 50 || vital.heartRate > 130 ? criticalParts : normalParts).push(value)
  }
  if (vital?.spO2 != null) {
    const value = `SpO2 ${vital.spO2}`
    ;(vital.spO2 < 95 ? criticalParts : normalParts).push(value)
  }
  if (vital?.temp != null) {
    const value = `${a.tempShort} ${vital.temp}`
    ;(vital.temp < 35 ? criticalParts : normalParts).push(value)
  }
  if (vital?.etco2 != null) normalParts.push(`CO2 ${vital.etco2}`)

  const eventParts = rowEvents
    .filter(event => event.type === "drug" || event.type === "clinical_event")
    .slice(0, 4)
    .map(labelOf)
  return {
    criticalParts,
    normalParts,
    eventParts,
    hasCritical: criticalParts.length > 0,
    hasUnsynced: rowEvents.some(event => event.syncStatus != null),
  }
}
