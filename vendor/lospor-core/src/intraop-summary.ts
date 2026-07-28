import type {
  GasSettingsSegment,
  LogEvent,
  NumericText,
  TimetableData,
  TimetableInfusion,
  VitalsEntry,
} from "./intraop-types"
import { INTRAOP_COLUMN_MINUTES } from "./intraop-engine"

export type DrugTotal = {
  name: string
  unit: string
  total: number
}

export type DrugLogEntry = {
  column: number
  time: string
  name: string
  dose: string
  unit: string
}

export type RunningItem =
  | { kind: "agent"; id: string; name: string; color: string }
  | { kind: "gas"; id: string; fgf: number; fio2: number; color: string }
  | { kind: "infusion"; id: string; name: string; rate: NumericText; unit: string; color: string }
  | { kind: "fluid"; id: string; name: string; volume: string; color: string }

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

export function describeIntraopEvent(
  event: SemanticLogEvent,
  options: EventDescriptorOptions = {},
): SemanticEventDescriptor {
  switch (event.type) {
    case "drug":
      return {
        key: "drug",
        text: `${event.name ?? ""} ${event.dose ?? ""} ${event.unit ?? ""}`.trim(),
        color: event.color ?? options.drugColor?.(event.name ?? "") ?? "#3b82f6",
        ...(event.category ? { sub: event.category } : {}),
      }
    case "vital": {
      const parts: string[] = []
      const previous = options.previousVital
      const trend = (current: number, prior: number | undefined) =>
        options.trend?.(current, prior) ?? ""
      if (event.systolic != null && event.diastolic != null) {
        parts.push(
          `BP ${event.systolic}${trend(event.systolic, previous?.systolic)}/${event.diastolic}`,
        )
      }
      if (event.heartRate != null) {
        parts.push(`HR ${event.heartRate}${trend(event.heartRate, previous?.heartRate)}`)
      }
      if (event.spO2 != null) {
        parts.push(`SpO2 ${event.spO2}%${trend(event.spO2, previous?.spO2)}`)
      }
      if (event.etco2 != null) {
        parts.push(`EtCO2 ${event.etco2}${trend(event.etco2, previous?.etco2)}`)
      }
      if (event.temp != null) parts.push(`${event.temp}\u00b0C`)
      if (event.bgl != null) parts.push(`Glucose ${event.bgl}`)
      return { key: "vital", text: parts.join("  "), color: "#22c55e" }
    }
    case "clinical_event": {
      const label = event.label ?? "Event"
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
        sub: "Infusion started",
      }
    case "infusion_rate":
      return {
        key: "infusion_rate_changed",
        text: `${event.name ?? ""} \u2192 ${event.rate ?? ""} ${event.unit ?? ""}`.trim(),
        color: event.color ?? "#6366f1",
        sub: "Rate changed",
      }
    case "infusion_stop":
      return {
        key: "infusion_stopped",
        text: `${event.name ?? "Infusion"} stopped`,
        color: "#64748b",
        sub: "Infusion",
      }
    case "fluid_start":
      return {
        key: "fluid_started",
        text: `${event.name ?? ""} ${event.volume ?? ""} mL`.trim(),
        color: event.color ?? "#06b6d4",
        sub: "Fluid",
      }
    case "fluid_end":
      return {
        key: "fluid_completed",
        text: `${event.name ?? "Fluid"} complete`,
        color: "#64748b",
        sub: "Fluid",
      }
    case "agent_start":
      return {
        key: "agent_started",
        text: event.value ? `${event.name ?? "Agent"} ${event.value}%` : `${event.name ?? "Agent"} on`,
        color: event.color ?? "#a855f7",
        sub: "Volatile",
      }
    case "agent_stop":
      return {
        key: "agent_stopped",
        text: `${event.name ?? "Agent"} off`,
        color: "#64748b",
        sub: "Volatile",
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
        sub: event.type === "gas_start" ? "Gas settings started" : "Gas settings changed",
      }
    case "gas_stop":
      return {
        key: "gas_stopped",
        text: "Gas settings stopped",
        color: "#64748b",
        sub: "Gas settings",
      }
    case "position_change":
      return {
        key: "position_changed",
        text: event.label ?? event.value ?? "Position changed",
        color: event.color ?? "#0ea5e9",
        sub: "Position",
      }
    case "phase_change":
      return {
        key: "phase_changed",
        text: event.label ?? event.value ?? "Phase changed",
        color: event.color ?? "#64748b",
        sub: "Case phase",
      }
    default:
      return {
        key: "event",
        text: event.label ?? event.type ?? "Event",
        color: event.color ?? "#64748b",
      }
  }
}

export function gasSettingsAtColumn(
  segment: GasSettingsSegment,
  column: number,
): EffectiveGasSettings | null {
  if (column < segment.startCol || column > segment.endCol) return null
  let latest: NonNullable<GasSettingsSegment["settingsChanges"]>[number] | undefined
  for (const change of segment.settingsChanges ?? []) {
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
    const existing = totals.get(key) ?? { name: drug.name, unit: drug.unit, total: 0 }
    existing.total += numeric(drug.dose)
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
    .filter(change => change.col <= column)
    .sort((a, b) => b.col - a.col)[0]
  return {
    rate: latest?.rate ?? infusion.rate,
    unit: latest?.unit ?? infusion.unit,
  }
}

export function runningItemsAt(
  timetable: TimetableData,
  column: number,
): RunningItem[] {
  const items: RunningItem[] = []
  for (const agent of timetable.agents) {
    if (column >= agent.startCol && column <= agent.endCol) {
      items.push({
        kind: "agent",
        id: `agent-${agent.name}`,
        name: agent.name,
        color: agent.color ?? "#a78bfa",
      })
    }
  }
  for (const gas of timetable.gasSettings ?? []) {
    const settings = gasSettingsAtColumn(gas, column)
    if (!settings) continue
    items.push({
      kind: "gas",
      id: gas.id || "gas-settings",
      fgf: settings.fgf,
      fio2: settings.fio2,
      color: "#818cf8",
    })
  }
  for (const infusion of timetable.infusions) {
    if (column < infusion.startCol || column > infusion.endCol) continue
    const activeRate = rateAtColumn(infusion, column)
    items.push({
      kind: "infusion",
      id: `inf-${infusion.id}`,
      name: infusion.name,
      rate: activeRate.rate,
      unit: activeRate.unit,
      color: infusion.color ?? "#3b82f6",
    })
  }
  for (const fluid of timetable.fluids) {
    if (column >= fluid.startCol && column <= fluid.endCol) {
      items.push({
        kind: "fluid",
        id: `fluid-${fluid.id}`,
        name: fluid.name,
        volume: fluid.volume,
        color: fluid.color ?? "#38bdf8",
      })
    }
  }
  return items
}

export function runningItemsByColumn(
  timetable: TimetableData,
  columns: number[],
): Map<number, RunningItem[]> {
  const rows = new Map(columns.map(column => [column, [] as RunningItem[]]))
  const push = (column: number, item: RunningItem) => {
    rows.get(column)?.push(item)
  }

  for (const agent of timetable.agents) {
    for (const column of columns) {
      if (column >= agent.startCol && column <= agent.endCol) {
        push(column, {
          kind: "agent",
          id: `agent-${agent.name}`,
          name: agent.name,
          color: agent.color ?? "#a78bfa",
        })
      }
    }
  }

  for (const gas of timetable.gasSettings ?? []) {
    for (const column of columns) {
      const settings = gasSettingsAtColumn(gas, column)
      if (!settings) continue
      push(column, {
        kind: "gas",
        id: gas.id || "gas-settings",
        fgf: settings.fgf,
        fio2: settings.fio2,
        color: "#818cf8",
      })
    }
  }

  for (const infusion of timetable.infusions) {
    const changes = [...(infusion.rateChanges ?? [])]
      .sort((a, b) => a.col - b.col)
    for (const column of columns) {
      if (column < infusion.startCol || column > infusion.endCol) continue
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
      })
    }
  }

  for (const fluid of timetable.fluids) {
    for (const column of columns) {
      if (column >= fluid.startCol && column <= fluid.endCol) {
        push(column, {
          kind: "fluid",
          id: `fluid-${fluid.id}`,
          name: fluid.name,
          volume: fluid.volume,
          color: fluid.color ?? "#38bdf8",
        })
      }
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
  const startMs = start instanceof Date ? start.getTime() : new Date(start).getTime()
  if (!Number.isFinite(startMs)) return `+${column * intervalMinutes}m`
  const date = new Date(startMs + column * intervalMinutes * 60_000)
  const hours = clock === "utc" ? date.getUTCHours() : date.getHours()
  const minutes = clock === "utc" ? date.getUTCMinutes() : date.getMinutes()
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

export function buildDrugLogEntries(
  timetable: Pick<TimetableData, "drugs">,
  start?: Date | string | number | null,
  clock: "local" | "utc" = "local",
): DrugLogEntry[] {
  return [...timetable.drugs]
    .sort((a, b) => a.colIdx - b.colIdx)
    .map(drug => ({
      column: drug.colIdx,
      time: formatColumnTime(drug.colIdx, start, INTRAOP_COLUMN_MINUTES, clock),
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

export function vitalSummaryParts(vital?: VitalsEntry): string[] {
  if (!vital) return []
  const parts: string[] = []
  if (vital.systolic != null && vital.diastolic != null) {
    parts.push(`${vital.systolic}/${vital.diastolic}`)
  }
  if (vital.heartRate != null) parts.push(`HR ${vital.heartRate}`)
  if (vital.spO2 != null) parts.push(`SpO2 ${vital.spO2}`)
  if (vital.etco2 != null) parts.push(`CO2 ${vital.etco2}`)
  return parts
}

export function buildRowSummary(
  vital: VitalsEntry | undefined,
  rowEvents: LogEvent[],
  labelOf: (event: LogEvent) => string,
): RowSummary {
  const criticalParts: string[] = []
  const normalParts: string[] = []
  if (vital?.systolic != null) {
    const value = `BP ${vital.systolic}/${vital.diastolic ?? "?"}`
    ;(vital.systolic < 90 ? criticalParts : normalParts).push(value)
  }
  if (vital?.heartRate != null) {
    const value = `HR ${vital.heartRate}`
    ;(vital.heartRate < 50 || vital.heartRate > 130 ? criticalParts : normalParts).push(value)
  }
  if (vital?.spO2 != null) {
    const value = `SpO2 ${vital.spO2}`
    ;(vital.spO2 < 95 ? criticalParts : normalParts).push(value)
  }
  if (vital?.temp != null) {
    const value = `T ${vital.temp}`
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
