import type {
  ActiveFluid,
  ActiveGasSettings,
  ActiveInfusion,
  AgentSegment,
  ClinicalEvent,
  GasSettingsSegment,
  LegacyKeyEvents,
  LogEvent,
  PhaseSegment,
  PositionSegment,
  TimetableData,
  TimetableFluid,
  TimetableInfusion,
  VitalsEntry,
} from "./intraop-types"

export const INTRAOP_COLUMN_MINUTES = 5
export const INTRAOP_COLUMN_MS = INTRAOP_COLUMN_MINUTES * 60_000
export const INTRAOP_RESUME_WINDOW_MS = 30 * 60 * 1000
export const INTRAOP_RESUME_WINDOW_SECONDS = INTRAOP_RESUME_WINDOW_MS / 1000
export const MAX_INTRAOP_COLUMNS = 2016

export function intraopColumnForInstant(
  instant: Date | string | number,
  chartStart: Date | string | number,
): number {
  return Math.max(0, Math.floor((timestamp(instant) - timestamp(chartStart)) / INTRAOP_COLUMN_MS))
}

export function intraopInstantForColumn(
  chartStart: Date | string | number,
  column: number,
): Date {
  return new Date(timestamp(chartStart) + Math.max(0, column) * INTRAOP_COLUMN_MS)
}

export function roundDownToIntraopColumn(instant: Date): Date {
  const rounded = new Date(instant)
  rounded.setSeconds(0, 0)
  rounded.setMinutes(
    Math.floor(rounded.getMinutes() / INTRAOP_COLUMN_MINUTES) * INTRAOP_COLUMN_MINUTES,
  )
  return rounded
}

export type IntraopProjectionContext = {
  start: Date | string | number
  openThrough?: Date | string | number
  intervalMinutes?: number
  maxColumns?: number
}

export type ActiveAgent = {
  name: string
  color: string
  percent?: number
} | null

export type IntraopActiveState = {
  infusions: ActiveInfusion[]
  fluids: ActiveFluid[]
  agent: ActiveAgent
  gas: ActiveGasSettings
}

function timestamp(value: Date | string | number): number {
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function gasFractions(
  carrierGas: string | null | undefined,
  fio2: number | null | undefined,
): { fio2: number; fiAir: number; fiN2O: number } {
  const safeFio2 = carrierGas == null
    ? 100
    : Math.min(100, Math.max(21, finiteNumber(fio2, 21)))
  return {
    fio2: safeFio2,
    fiAir: carrierGas === "air" ? 100 - safeFio2 : 0,
    fiN2O: carrierGas === "n2o" ? 100 - safeFio2 : 0,
  }
}

export function sortIntraopEvents(events: LogEvent[]): LogEvent[] {
  return events
    .map((event, inputIndex) => ({ event, inputIndex }))
    .sort((a, b) => {
      const timeDifference = timestamp(a.event.ts) - timestamp(b.event.ts)
      if (timeDifference !== 0) return timeDifference
      const sequenceDifference = (a.event.sequence ?? 0) - (b.event.sequence ?? 0)
      if (sequenceDifference !== 0) return sequenceDifference
      if (a.event.id !== b.event.id) return a.event.id < b.event.id ? -1 : 1
      return a.inputIndex - b.inputIndex
    })
    .map(({ event }) => event)
}

export function intraopEventColumn(
  event: Pick<LogEvent, "ts">,
  context: Pick<IntraopProjectionContext, "start" | "intervalMinutes" | "maxColumns">,
): number {
  const intervalMs = (context.intervalMinutes ?? INTRAOP_COLUMN_MINUTES) * 60_000
  const maxColumn = context.maxColumns ?? MAX_INTRAOP_COLUMNS
  const column = Math.floor((timestamp(event.ts) - timestamp(context.start)) / intervalMs)
  return Math.min(Math.max(0, column), maxColumn)
}

export function projectIntraopEvents(
  events: LogEvent[],
  context: IntraopProjectionContext,
): TimetableData {
  const vitals: VitalsEntry[] = []
  const drugs: TimetableData["drugs"] = []
  const infusions: TimetableInfusion[] = []
  const fluids: TimetableFluid[] = []
  const agents: AgentSegment[] = []
  const gasSettings: GasSettingsSegment[] = []
  const clinicalEvents: ClinicalEvent[] = []
  const positions: PositionSegment[] = []
  const phases: PhaseSegment[] = []

  const activeInfusions = new Map<string, {
    startCol: number
    event: LogEvent
    initialRate: string
    rateChanges: NonNullable<TimetableInfusion["rateChanges"]>
  }>()
  const activeFluids = new Map<string, { startCol: number; event: LogEvent }>()
  let activeAgent: { name: string; color: string; startCol: number; percent?: number } | null = null
  let activeGas: {
    id: string
    startCol: number
    fgf: number
    carrierGas: string | null
    fio2: number
    fiAir: number
    fiN2O: number
    settingsChanges: NonNullable<GasSettingsSegment["settingsChanges"]>
  } | null = null
  let activePosition: { position: string; startCol: number } | undefined
  let activePhase: { phase: string; startCol: number } | undefined
  let maxEventColumn = 0

  for (const event of sortIntraopEvents(events)) {
    const col = intraopEventColumn(event, context)
    maxEventColumn = Math.max(maxEventColumn, col)

    if (event.type === "vital") {
      while (vitals.length <= col) vitals.push({})
      vitals[col] = {
        systolic: event.systolic,
        diastolic: event.diastolic,
        heartRate: event.heartRate,
        spO2: event.spO2,
        etco2: event.etco2,
        temp: event.temp,
        bgl: event.bgl,
      }
      continue
    }

    if (event.type === "drug") {
      drugs.push({
        colIdx: col,
        name: event.name ?? "",
        dose: event.dose ?? "",
        unit: event.unit ?? "",
        drugId: event.drugId,
        atcCode: event.atcCode,
        inn: event.inn,
        route: event.drugRoute,
      })
      continue
    }

    if (event.type === "infusion_start" && event.infId) {
      activeInfusions.set(event.infId, {
        startCol: col,
        event,
        initialRate: event.rate ?? "0",
        rateChanges: [],
      })
      continue
    }

    if (event.type === "infusion_rate" && event.infId) {
      const active = activeInfusions.get(event.infId)
      if (active) {
        active.rateChanges.push({
          col,
          rate: finiteNumber(event.rate ?? active.event.rate),
          unit: event.unit ?? active.event.unit ?? "",
          ...(event.concentration !== undefined
            ? { concentration: event.concentration }
            : {}),
        })
        active.event = {
          ...active.event,
          rate: event.rate ?? active.event.rate,
          concentration: event.concentration ?? active.event.concentration,
        }
      }
      continue
    }

    if (event.type === "infusion_stop" && event.infId) {
      const active = activeInfusions.get(event.infId)
      if (active) {
        infusions.push(infusionSegment(event.infId, active, col, true))
        activeInfusions.delete(event.infId)
      }
      continue
    }

    if (event.type === "fluid_start" && event.fluidId) {
      activeFluids.set(event.fluidId, { startCol: col, event })
      continue
    }

    if (event.type === "fluid_end" && event.fluidId) {
      const active = activeFluids.get(event.fluidId)
      if (active) {
        fluids.push(fluidSegment(event.fluidId, active, col, true))
        activeFluids.delete(event.fluidId)
      }
      continue
    }

    if (event.type === "agent_start" && event.name) {
      if (activeAgent && activeAgent.name !== event.name) {
        agents.push({ ...activeAgent, endCol: col, stopped: true })
      }
      if (!activeAgent || activeAgent.name !== event.name) {
        activeAgent = {
          name: event.name,
          color: event.color ?? "#a855f7",
          startCol: col,
          percent: event.value == null ? undefined : finiteNumber(event.value),
        }
      } else if (event.value != null) {
        activeAgent.percent = finiteNumber(event.value)
      }
      continue
    }

    if (event.type === "agent_stop" && activeAgent) {
      agents.push({ ...activeAgent, endCol: col, stopped: true })
      activeAgent = null
      continue
    }

    if (event.type === "gas_start") {
      if (activeGas) gasSettings.push(gasSegment(activeGas, col, true))
      const fractions = gasFractions(event.carrierGas, event.fio2)
      activeGas = {
        id: `gas-${event.id}`,
        startCol: col,
        fgf: finiteNumber(event.fgf),
        carrierGas: event.carrierGas ?? null,
        fio2: fractions.fio2,
        fiAir: event.fiAir ?? fractions.fiAir,
        fiN2O: event.fiN2O ?? fractions.fiN2O,
        settingsChanges: [],
      }
      continue
    }

    if (event.type === "gas_change" && activeGas) {
      const carrierGas = event.carrierGas ?? activeGas.carrierGas
      const fractions = gasFractions(carrierGas, event.fio2 ?? activeGas.fio2)
      activeGas.settingsChanges.push({
        col,
        fgf: event.fgf ?? activeGas.fgf,
        carrierGas,
        fio2: fractions.fio2,
        fiAir: event.fiAir ?? fractions.fiAir,
        fiN2O: event.fiN2O ?? fractions.fiN2O,
      })
      continue
    }

    if (event.type === "gas_stop" && activeGas) {
      gasSettings.push(gasSegment(activeGas, col, true))
      activeGas = null
      continue
    }

    if (event.type === "clinical_event" && event.label) {
      clinicalEvents.push({
        colIdx: col,
        label: event.label,
        color: event.color ?? "#64748b",
      })
      continue
    }

    if (event.type === "position_change" && event.name) {
      if (!activePosition || activePosition.position !== event.name) {
        if (activePosition) positions.push({ ...activePosition, endCol: col })
        activePosition = { position: event.name, startCol: col }
      }
      continue
    }

    if (event.type === "phase_change" && event.name) {
      if (!activePhase || activePhase.phase !== event.name) {
        if (activePhase) phases.push({ ...activePhase, endCol: col })
        activePhase = { phase: event.name, startCol: col }
      }
    }
  }

  const openThroughColumn = context.openThrough == null
    ? maxEventColumn
    : intraopEventColumn({ ts: new Date(timestamp(context.openThrough)).toISOString() }, context)
  const openEnd = Math.max(maxEventColumn, openThroughColumn) + 1

  for (const [id, active] of activeInfusions) {
    infusions.push(infusionSegment(id, active, openEnd, false))
  }
  for (const [id, active] of activeFluids) {
    fluids.push(fluidSegment(id, active, openEnd, false))
  }
  if (activeAgent) agents.push({ ...activeAgent, endCol: openEnd })
  if (activeGas) gasSettings.push(gasSegment(activeGas, openEnd, false))
  if (activePosition) positions.push({ ...activePosition, endCol: openEnd })
  if (activePhase) phases.push({ ...activePhase, endCol: openEnd })

  return {
    vitals,
    drugs,
    infusions,
    fluids,
    agents,
    gasSettings,
    clinicalEvents,
    positions,
    phases,
  }
}

function infusionSegment(
  id: string,
  active: {
    startCol: number
    event: LogEvent
    initialRate: string
    rateChanges: NonNullable<TimetableInfusion["rateChanges"]>
  },
  endCol: number,
  stopped: boolean,
): TimetableInfusion {
  return {
    id,
    name: active.event.name ?? "",
    rate: finiteNumber(active.initialRate),
    unit: active.event.unit ?? "",
    color: active.event.color ?? "#8b5cf6",
    startCol: active.startCol,
    endCol,
    stopped,
    concentration: active.event.concentration,
    route: active.event.drugRoute,
    drugId: active.event.drugId,
    atcCode: active.event.atcCode,
    inn: active.event.inn,
    rateChanges: active.rateChanges.length ? active.rateChanges : undefined,
  }
}

function fluidSegment(
  id: string,
  active: { startCol: number; event: LogEvent },
  endCol: number,
  stopped: boolean,
): TimetableFluid {
  return {
    id,
    name: active.event.name ?? "",
    category: active.event.category ?? "",
    volume: active.event.volume ?? "",
    color: active.event.color ?? "#06b6d4",
    startCol: active.startCol,
    endCol,
    stopped,
  }
}

function gasSegment(
  active: {
    id: string
    startCol: number
    fgf: number
    carrierGas: string | null
    fio2: number
    fiAir: number
    fiN2O: number
    settingsChanges: NonNullable<GasSettingsSegment["settingsChanges"]>
  },
  endCol: number,
  stopped: boolean,
): GasSettingsSegment {
  return {
    id: active.id,
    startCol: active.startCol,
    endCol,
    stopped,
    fgf: active.fgf,
    carrierGas: active.carrierGas,
    fio2: active.fio2,
    fiAir: active.fiAir,
    fiN2O: active.fiN2O,
    settingsChanges: active.settingsChanges.length ? active.settingsChanges : undefined,
  }
}

export function reverseProjectIntraop(
  timetable: LegacyKeyEvents,
  baseTime: Date | string | number,
  intervalMinutes = INTRAOP_COLUMN_MINUTES,
): LogEvent[] {
  const baseMs = timestamp(baseTime)
  const timestampFor = (column: number) =>
    new Date(baseMs + Math.max(0, column) * intervalMinutes * 60_000).toISOString()
  const events: LogEvent[] = []
  let sequence = 0
  const create = (event: Omit<LogEvent, "id" | "sequence">): LogEvent => ({
    id: `seed-${sequence}`,
    sequence: sequence++,
    ...event,
  })

  for (const [column, vital] of (timetable.vitals ?? []).entries()) {
    if (vital && Object.values(vital).some(value => value != null)) {
      events.push(create({ type: "vital", ts: timestampFor(column), ...vital }))
    }
  }
  for (const drug of timetable.drugs ?? []) {
    events.push(create({
      type: "drug",
      ts: timestampFor(drug.colIdx),
      name: drug.name,
      dose: drug.dose,
      unit: drug.unit,
      drugId: drug.drugId,
      atcCode: drug.atcCode,
      inn: drug.inn,
      drugRoute: drug.route,
    }))
  }
  for (const clinicalEvent of timetable.clinicalEvents ?? []) {
    events.push(create({
      type: "clinical_event",
      ts: timestampFor(clinicalEvent.colIdx),
      label: clinicalEvent.label,
      color: clinicalEvent.color,
    }))
  }
  for (const infusion of timetable.infusions ?? []) {
    events.push(create({
      type: "infusion_start",
      ts: timestampFor(infusion.startCol),
      infId: infusion.id,
      name: infusion.name,
      rate: String(infusion.rate),
      unit: infusion.unit,
      color: infusion.color,
      concentration: infusion.concentration,
      drugRoute: infusion.route,
      drugId: infusion.drugId,
      atcCode: infusion.atcCode,
      inn: infusion.inn,
    }))
    for (const change of infusion.rateChanges ?? []) {
      events.push(create({
        type: "infusion_rate",
        ts: timestampFor(change.col),
        infId: infusion.id,
        rate: String(change.rate),
        unit: change.unit,
        concentration: change.concentration,
      }))
    }
    if (infusion.stopped) {
      events.push(create({
        type: "infusion_stop",
        ts: timestampFor(infusion.endCol),
        infId: infusion.id,
      }))
    }
  }
  for (const fluid of timetable.fluids ?? []) {
    events.push(create({
      type: "fluid_start",
      ts: timestampFor(fluid.startCol),
      fluidId: fluid.id,
      name: fluid.name,
      category: fluid.category,
      volume: fluid.volume,
      color: fluid.color,
    }))
    if (fluid.stopped) {
      events.push(create({
        type: "fluid_end",
        ts: timestampFor(fluid.endCol),
        fluidId: fluid.id,
      }))
    }
  }
  for (const agent of timetable.agents ?? []) {
    events.push(create({
      type: "agent_start",
      ts: timestampFor(agent.startCol),
      name: agent.name,
      color: agent.color,
      value: agent.percent == null ? undefined : String(agent.percent),
    }))
    if (agent.stopped) {
      events.push(create({
        type: "agent_stop",
        ts: timestampFor(agent.endCol),
        name: agent.name,
      }))
    }
  }
  for (const gas of timetable.gasSettings ?? []) {
    const initialFractions = gasFractions(gas.carrierGas, gas.fio2)
    events.push(create({
      type: "gas_start",
      ts: timestampFor(gas.startCol),
      fgf: gas.fgf,
      carrierGas: gas.carrierGas,
      fio2: initialFractions.fio2,
      fiAir: gas.fiAir ?? initialFractions.fiAir,
      fiN2O: gas.fiN2O ?? initialFractions.fiN2O,
    }))
    for (const change of gas.settingsChanges ?? []) {
      const fractions = gasFractions(change.carrierGas, change.fio2)
      events.push(create({
        type: "gas_change",
        ts: timestampFor(change.col),
        fgf: change.fgf,
        carrierGas: change.carrierGas,
        fio2: fractions.fio2,
        fiAir: change.fiAir ?? fractions.fiAir,
        fiN2O: change.fiN2O ?? fractions.fiN2O,
      }))
    }
    if (gas.stopped) {
      events.push(create({ type: "gas_stop", ts: timestampFor(gas.endCol) }))
    }
  }
  for (const position of timetable.positions ?? []) {
    events.push(create({
      type: "position_change",
      ts: timestampFor(position.startCol),
      name: position.position,
    }))
  }
  for (const phase of timetable.phases ?? []) {
    events.push(create({
      type: "phase_change",
      ts: timestampFor(phase.startCol),
      name: phase.phase,
    }))
  }
  return sortIntraopEvents(events)
}

export function rebuildIntraopActiveState(events: LogEvent[]): IntraopActiveState {
  const infusions = new Map<string, ActiveInfusion>()
  const fluids = new Map<string, ActiveFluid>()
  let agent: ActiveAgent = null
  let gas: ActiveGasSettings = null

  for (const event of sortIntraopEvents(events)) {
    if (event.type === "infusion_start" && event.infId) {
      infusions.set(event.infId, {
        infId: event.infId,
        name: event.name ?? "",
        rate: event.rate ?? "",
        unit: event.unit ?? "",
        color: event.color ?? "#8b5cf6",
        concentration: event.concentration,
        route: event.drugRoute,
        drugId: event.drugId,
        atcCode: event.atcCode,
        inn: event.inn,
      })
    } else if (event.type === "infusion_rate" && event.infId) {
      const active = infusions.get(event.infId)
      if (active) {
        active.rate = event.rate ?? active.rate
        active.unit = event.unit ?? active.unit
        active.concentration = event.concentration ?? active.concentration
      }
    } else if (event.type === "infusion_stop" && event.infId) {
      infusions.delete(event.infId)
    } else if (event.type === "fluid_start" && event.fluidId) {
      fluids.set(event.fluidId, {
        fluidId: event.fluidId,
        name: event.name ?? "",
        volume: event.volume ?? "",
        color: event.color ?? "#06b6d4",
      })
    } else if (event.type === "fluid_end" && event.fluidId) {
      fluids.delete(event.fluidId)
    } else if (event.type === "agent_start" && event.name) {
      agent = {
        name: event.name,
        color: event.color ?? "#a855f7",
        percent: event.value == null ? undefined : finiteNumber(event.value),
      }
    } else if (event.type === "agent_stop") {
      agent = null
    } else if (event.type === "gas_start" || event.type === "gas_change") {
      const fractions = gasFractions(event.carrierGas, event.fio2)
      gas = {
        fgf: finiteNumber(event.fgf),
        carrierGas: event.carrierGas ?? null,
        fio2: fractions.fio2,
        fiAir: event.fiAir ?? fractions.fiAir,
        fiN2O: event.fiN2O ?? fractions.fiN2O,
      }
    } else if (event.type === "gas_stop") {
      gas = null
    }
  }

  return {
    infusions: [...infusions.values()],
    fluids: [...fluids.values()],
    agent,
    gas,
  }
}
