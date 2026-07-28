export type EventType =
  | "drug" | "vital" | "clinical_event"
  | "infusion_start" | "infusion_rate" | "infusion_stop"
  | "fluid_start" | "fluid_end"
  | "agent_start" | "agent_stop"
  | "gas_start" | "gas_change" | "gas_stop"
  | "position_change" | "phase_change"

// Time-anchored patient-position / case-phase segments, projected from
// position_change / phase_change events the same way agent segments are:
// each change closes the previous segment and opens a new one; the last
// segment stays open-tailed to the end of the chart.
export type PositionSegment = { position: string; startCol: number; endCol: number }
export type PhaseSegment    = { phase: string; startCol: number; endCol: number }

export type LogEvent = {
  id: string
  ts: string
  sequence?: number
  type: EventType
  name?: string
  dose?: string
  unit?: string
  category?: string
  color?: string
  systolic?: number
  diastolic?: number
  heartRate?: number
  spO2?: number
  etco2?: number
  temp?: number
  bgl?: number
  label?: string
  value?: string
  infId?: string
  rate?: string
  fluidId?: string
  volume?: string
  drugRoute?: string
  concentration?: string
  atcCode?: string
  drugId?: string
  inn?: string
  fgf?: number
  carrierGas?: string | null
  fio2?: number
  fiAir?: number
  fiN2O?: number
  syncStatus?: "pending" | "failed"
}

export type ActiveInfusion = {
  infId: string
  name: string
  rate: string
  unit: string
  color: string
  concentration?: string
  route?: string
  drugId?: string
  atcCode?: string
  inn?: string
}

export type ActiveFluid = {
  fluidId: string
  name: string
  volume: string
  color: string
}

export type ActiveGasSettings = {
  fgf: number
  carrierGas: string | null
  fio2: number
  fiAir?: number
  fiN2O?: number
} | null

export type NumericText = number | string

export type VitalsEntry = {
  systolic?: number
  diastolic?: number
  heartRate?: number
  spO2?: number
  etco2?: number
  temp?: number
  bgl?: number
}

export type TimetableDrug = {
  colIdx: number
  name: string
  dose: string
  unit: string
  drugId?: string
  atcCode?: string
  inn?: string
  route?: string
}

export type TimetableFluid = {
  id: string
  name: string
  category?: string
  volume: string
  color: string
  startCol: number
  endCol: number
  stopped?: boolean
}

export type TimetableRateChange = {
  col: number
  rate: NumericText
  unit: string
  concentration?: string
}

export type TimetableInfusion = {
  id: string
  name: string
  rate: NumericText
  unit: string
  startCol: number
  endCol: number
  color: string
  stopped?: boolean
  concentration?: string
  route?: string
  drugId?: string
  atcCode?: string
  inn?: string
  rateChanges?: TimetableRateChange[]
}

export type AgentSegment = {
  name: string
  color?: string
  startCol: number
  endCol: number
  n2o?: number
  percent?: number
  stopped?: boolean
}

export type ClinicalEvent = {
  colIdx: number
  label: string
  color: string
}

export type GasSettingsChange = {
  col: number
  fgf: number
  carrierGas: string | null
  fio2: number
  fiAir?: number
  fiN2O?: number
}

export type GasSettingsSegment = {
  id: string
  startCol: number
  endCol: number
  stopped?: boolean
  fgf: number
  carrierGas: string | null
  fio2: number
  fiAir?: number
  fiN2O?: number
  settingsChanges?: GasSettingsChange[]
}

export type TimetableData = {
  vitals: VitalsEntry[]
  drugs: TimetableDrug[]
  fluids: TimetableFluid[]
  agents: AgentSegment[]
  infusions: TimetableInfusion[]
  gasSettings?: GasSettingsSegment[]
  clinicalEvents?: ClinicalEvent[]
  positions?: PositionSegment[]
  phases?: PhaseSegment[]
}

export type LegacyKeyEvents = Partial<TimetableData> & {
  log?: LogEvent[]
}

const EVENT_TYPES = new Set<EventType>([
  "drug",
  "vital",
  "clinical_event",
  "infusion_start",
  "infusion_rate",
  "infusion_stop",
  "fluid_start",
  "fluid_end",
  "agent_start",
  "agent_stop",
  "gas_start",
  "gas_change",
  "gas_stop",
  "position_change",
  "phase_change",
])

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  return typeof record[key] === "string" ? record[key] : undefined
}

function optionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function requiredString(record: Record<string, unknown>, key: string): string | null {
  const value = optionalString(record, key)
  return value !== undefined && value.length > 0 ? value : null
}

function requiredNumber(record: Record<string, unknown>, key: string): number | null {
  return optionalNumber(record, key) ?? null
}

function numericText(value: unknown): NumericText | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.length > 0) return value
  return null
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  return typeof record[key] === "boolean" ? record[key] : undefined
}

function parseArray<T>(value: unknown, parser: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return []
  return value.map(parser).filter((item): item is T => item !== null)
}

export function parseLogEvent(value: unknown): LogEvent | null {
  if (!isRecord(value)) return null
  const { id, ts, type } = value
  if (typeof id !== "string" || typeof ts !== "string" || typeof type !== "string") return null
  const canonicalType = type === "event" ? "clinical_event" : type
  if (!EVENT_TYPES.has(canonicalType as EventType)) return null

  const event: LogEvent = {
    id,
    ts,
    type: canonicalType as EventType,
  }
  const stringFields = [
    "name", "dose", "unit", "category", "color", "label", "value", "infId",
    "rate", "fluidId", "volume", "drugRoute", "concentration", "atcCode",
    "drugId", "inn",
  ] as const
  for (const key of stringFields) {
    const parsed = optionalString(value, key)
    if (parsed !== undefined) event[key] = parsed
  }
  const numberFields = [
    "systolic", "diastolic", "heartRate", "spO2", "etco2", "temp", "bgl",
    "fgf", "fio2", "fiAir", "fiN2O", "sequence",
  ] as const
  for (const key of numberFields) {
    const parsed = optionalNumber(value, key)
    if (parsed !== undefined) event[key] = parsed
  }
  if (value.carrierGas === null || typeof value.carrierGas === "string") {
    event.carrierGas = value.carrierGas
  }
  if (value.syncStatus === "pending" || value.syncStatus === "failed") {
    event.syncStatus = value.syncStatus
  }
  return event
}

export function parseLogEvents(value: unknown): LogEvent[] {
  return parseArray(value, parseLogEvent)
}

function parseVitalsEntry(value: unknown): VitalsEntry | null {
  if (!isRecord(value)) return null
  const result: VitalsEntry = {}
  const fields = ["systolic", "diastolic", "heartRate", "spO2", "etco2", "temp", "bgl"] as const
  for (const key of fields) {
    const parsed = optionalNumber(value, key)
    if (parsed !== undefined) result[key] = parsed
  }
  return result
}

function parseTimetableDrug(value: unknown): TimetableDrug | null {
  if (!isRecord(value)) return null
  const colIdx = requiredNumber(value, "colIdx")
  const name = requiredString(value, "name")
  const dose = numericText(value.dose)
  const unit = requiredString(value, "unit")
  if (colIdx === null || name === null || dose === null || unit === null) return null
  return {
    colIdx,
    name,
    dose: String(dose),
    unit,
    ...optionalIdentity(value),
    ...(optionalString(value, "route") !== undefined ? { route: optionalString(value, "route") } : {}),
  }
}

function optionalIdentity(record: Record<string, unknown>) {
  return {
    ...(optionalString(record, "drugId") !== undefined ? { drugId: optionalString(record, "drugId") } : {}),
    ...(optionalString(record, "atcCode") !== undefined ? { atcCode: optionalString(record, "atcCode") } : {}),
    ...(optionalString(record, "inn") !== undefined ? { inn: optionalString(record, "inn") } : {}),
  }
}

function parseTimetableFluid(value: unknown): TimetableFluid | null {
  if (!isRecord(value)) return null
  const id = requiredString(value, "id")
  const name = requiredString(value, "name")
  const volume = numericText(value.volume)
  const startCol = requiredNumber(value, "startCol")
  const endCol = requiredNumber(value, "endCol")
  if (id === null || name === null || volume === null || startCol === null || endCol === null) return null
  return {
    id,
    name,
    volume: String(volume),
    color: optionalString(value, "color") ?? "#38bdf8",
    startCol,
    endCol,
    ...(optionalString(value, "category") !== undefined ? { category: optionalString(value, "category") } : {}),
    ...(optionalBoolean(value, "stopped") !== undefined ? { stopped: optionalBoolean(value, "stopped") } : {}),
  }
}

function parseTimetableRateChange(value: unknown): TimetableRateChange | null {
  if (!isRecord(value)) return null
  const col = requiredNumber(value, "col")
  const rate = numericText(value.rate)
  const unit = requiredString(value, "unit")
  if (col === null || rate === null || unit === null) return null
  return {
    col,
    rate,
    unit,
    ...(optionalString(value, "concentration") !== undefined
      ? { concentration: optionalString(value, "concentration") }
      : {}),
  }
}

function parseTimetableInfusion(value: unknown): TimetableInfusion | null {
  if (!isRecord(value)) return null
  const id = requiredString(value, "id")
  const name = requiredString(value, "name")
  const rate = numericText(value.rate)
  const unit = requiredString(value, "unit")
  const startCol = requiredNumber(value, "startCol")
  const endCol = requiredNumber(value, "endCol")
  if (id === null || name === null || rate === null || unit === null || startCol === null || endCol === null) {
    return null
  }
  return {
    id,
    name,
    rate,
    unit,
    startCol,
    endCol,
    color: optionalString(value, "color") ?? "#3b82f6",
    ...optionalIdentity(value),
    ...(optionalBoolean(value, "stopped") !== undefined ? { stopped: optionalBoolean(value, "stopped") } : {}),
    ...(optionalString(value, "concentration") !== undefined
      ? { concentration: optionalString(value, "concentration") }
      : {}),
    ...(optionalString(value, "route") !== undefined ? { route: optionalString(value, "route") } : {}),
    ...(Array.isArray(value.rateChanges)
      ? { rateChanges: parseArray(value.rateChanges, parseTimetableRateChange) }
      : {}),
  }
}

function parseAgentSegment(value: unknown): AgentSegment | null {
  if (!isRecord(value)) return null
  const name = requiredString(value, "name")
  const startCol = requiredNumber(value, "startCol")
  const endCol = requiredNumber(value, "endCol")
  if (name === null || startCol === null || endCol === null) return null
  return {
    name,
    startCol,
    endCol,
    ...(optionalString(value, "color") !== undefined ? { color: optionalString(value, "color") } : {}),
    ...(optionalNumber(value, "n2o") !== undefined ? { n2o: optionalNumber(value, "n2o") } : {}),
    ...(optionalNumber(value, "percent") !== undefined ? { percent: optionalNumber(value, "percent") } : {}),
    ...(optionalBoolean(value, "stopped") !== undefined ? { stopped: optionalBoolean(value, "stopped") } : {}),
  }
}

function parseClinicalEvent(value: unknown): ClinicalEvent | null {
  if (!isRecord(value)) return null
  const colIdx = requiredNumber(value, "colIdx")
  const label = requiredString(value, "label")
  if (colIdx === null || label === null) return null
  return { colIdx, label, color: optionalString(value, "color") ?? "#ef4444" }
}

function parseGasSettingsChange(value: unknown): GasSettingsChange | null {
  if (!isRecord(value)) return null
  const col = requiredNumber(value, "col")
  const fgf = requiredNumber(value, "fgf")
  const fio2 = requiredNumber(value, "fio2")
  if (col === null || fgf === null || fio2 === null) return null
  return {
    col,
    fgf,
    carrierGas: value.carrierGas === null || typeof value.carrierGas === "string" ? value.carrierGas : null,
    fio2,
    ...(optionalNumber(value, "fiAir") !== undefined ? { fiAir: optionalNumber(value, "fiAir") } : {}),
    ...(optionalNumber(value, "fiN2O") !== undefined ? { fiN2O: optionalNumber(value, "fiN2O") } : {}),
  }
}

function parseGasSettingsSegment(value: unknown): GasSettingsSegment | null {
  if (!isRecord(value)) return null
  const id = requiredString(value, "id")
  const startCol = requiredNumber(value, "startCol")
  const endCol = requiredNumber(value, "endCol")
  const fgf = requiredNumber(value, "fgf")
  const fio2 = requiredNumber(value, "fio2")
  if (id === null || startCol === null || endCol === null || fgf === null || fio2 === null) return null
  return {
    id,
    startCol,
    endCol,
    fgf,
    carrierGas: value.carrierGas === null || typeof value.carrierGas === "string" ? value.carrierGas : null,
    fio2,
    ...(optionalBoolean(value, "stopped") !== undefined ? { stopped: optionalBoolean(value, "stopped") } : {}),
    ...(optionalNumber(value, "fiAir") !== undefined ? { fiAir: optionalNumber(value, "fiAir") } : {}),
    ...(optionalNumber(value, "fiN2O") !== undefined ? { fiN2O: optionalNumber(value, "fiN2O") } : {}),
    ...(Array.isArray(value.settingsChanges)
      ? { settingsChanges: parseArray(value.settingsChanges, parseGasSettingsChange) }
      : {}),
  }
}

function parsePositionSegment(value: unknown): PositionSegment | null {
  if (!isRecord(value)) return null
  const position = requiredString(value, "position")
  const startCol = requiredNumber(value, "startCol")
  const endCol = requiredNumber(value, "endCol")
  return position !== null && startCol !== null && endCol !== null ? { position, startCol, endCol } : null
}

function parsePhaseSegment(value: unknown): PhaseSegment | null {
  if (!isRecord(value)) return null
  const phase = requiredString(value, "phase")
  const startCol = requiredNumber(value, "startCol")
  const endCol = requiredNumber(value, "endCol")
  return phase !== null && startCol !== null && endCol !== null ? { phase, startCol, endCol } : null
}

export function parseLegacyKeyEvents(value: unknown): LegacyKeyEvents {
  if (!isRecord(value)) return {}
  return {
    ...(Array.isArray(value.vitals)
      ? { vitals: value.vitals.map(item => parseVitalsEntry(item) ?? {}) }
      : {}),
    ...(Array.isArray(value.drugs) ? { drugs: parseArray(value.drugs, parseTimetableDrug) } : {}),
    ...(Array.isArray(value.fluids) ? { fluids: parseArray(value.fluids, parseTimetableFluid) } : {}),
    ...(Array.isArray(value.agents) ? { agents: parseArray(value.agents, parseAgentSegment) } : {}),
    ...(Array.isArray(value.infusions) ? { infusions: parseArray(value.infusions, parseTimetableInfusion) } : {}),
    ...(Array.isArray(value.gasSettings)
      ? { gasSettings: parseArray(value.gasSettings, parseGasSettingsSegment) }
      : {}),
    ...(Array.isArray(value.clinicalEvents)
      ? { clinicalEvents: parseArray(value.clinicalEvents, parseClinicalEvent) }
      : {}),
    ...(Array.isArray(value.positions) ? { positions: parseArray(value.positions, parsePositionSegment) } : {}),
    ...(Array.isArray(value.phases) ? { phases: parseArray(value.phases, parsePhaseSegment) } : {}),
    ...(Array.isArray(value.log) ? { log: parseLogEvents(value.log) } : {}),
  }
}
