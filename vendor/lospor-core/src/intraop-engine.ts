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
import {
  calculateFluidVolumeMl,
  isBloodProductFluid,
  normalizeFluidEntryMode,
} from "./intraop-fluids"

export const INTRAOP_COLUMN_MINUTES = 5
export const INTRAOP_COLUMN_MS = INTRAOP_COLUMN_MINUTES * 60_000
export const INTRAOP_RESUME_WINDOW_MS = 30 * 60 * 1000
export const INTRAOP_RESUME_WINDOW_SECONDS = INTRAOP_RESUME_WINDOW_MS / 1000
export const MAX_INTRAOP_COLUMNS = 2016
const FLUID_EVENT_ORDER: Partial<Record<LogEvent["type"], number>> = {
  fluid_start: 0,
  fluid_rate: 1,
  fluid_end: 2,
}

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
  /** "Now" for a live chart: running items end in this column. */
  openThrough?: Date | string | number
  /**
   * The case end, once the case has ended. It takes precedence over
   * openThrough: items continued postoperatively end here, and every total is
   * capped here.
   */
  endedAt?: Date | string | number | null
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
  /** Every volatile agent running (several may run at once from 1.4.9). */
  agents: NonNullable<ActiveAgent>[]
  /** The most recently started running agent; kept for callers not yet on `agents`. */
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
      if (a.event.fluidId && a.event.fluidId === b.event.fluidId) {
        const lifecycleDifference = (FLUID_EVENT_ORDER[a.event.type] ?? 1)
          - (FLUID_EVENT_ORDER[b.event.type] ?? 1)
        if (lifecycleDifference !== 0) return lifecycleDifference
      }
      const sequenceDifference = (a.event.sequence ?? 0) - (b.event.sequence ?? 0)
      if (sequenceDifference !== 0) return sequenceDifference
      // Within one minute an item starts before it changes and changes before
      // it stops: stamps share the minute, so the clock alone cannot tell.
      const lifecycle = sameItemLifecycleDifference(a.event, b.event)
      if (lifecycle !== 0) return lifecycle
      if (a.event.id !== b.event.id) return a.event.id < b.event.id ? -1 : 1
      return a.inputIndex - b.inputIndex
    })
    .map(({ event }) => event)
}

const LIFECYCLE_ORDER: Partial<Record<LogEvent["type"], [string, number]>> = {
  infusion_start: ["infusion", 0], infusion_rate: ["infusion", 1], infusion_stop: ["infusion", 2],
  agent_start: ["agent", 0], agent_stop: ["agent", 2],
  gas_start: ["gas", 0], gas_change: ["gas", 1], gas_stop: ["gas", 2],
}

function sameItemLifecycleDifference(a: LogEvent, b: LogEvent): number {
  const left = LIFECYCLE_ORDER[a.type]
  const right = LIFECYCLE_ORDER[b.type]
  if (!left || !right || left[0] !== right[0]) return 0
  const sameItem = left[0] === "gas"
    || (left[0] === "infusion" && a.infId != null && a.infId === b.infId)
    || (left[0] === "agent" && (a.name == null || b.name == null || a.name === b.name))
  return sameItem ? left[1] - right[1] : 0
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

  const activeInfusions = new Map<string, ActiveInfusionEntry>()
  const activeFluids = new Map<string, ActiveFluidEntry>()
  // Several volatile agents may run at once (1.4.9). Keyed by agent name.
  const activeAgents = new Map<string, ActiveAgentEntry>()
  let activeGas: ActiveGasEntry | null = null
  let activePosition: { position: string; startCol: number; startEventId?: string } | undefined
  let activePhase: { phase: string; startCol: number; startEventId?: string } | undefined
  let maxEventColumn = 0

  // The instant the chart is read at: the case end once the case has ended,
  // otherwise now. Events after it are planned (future-dated drafts): a start
  // is drawn as a marker in its own column, a stop marks the running bar
  // instead of ending it, and neither counts in any total until reached.
  const asOfMs = asOfInstant(context)
  const asOfCol = asOfMs == null
    ? null
    : intraopEventColumn({ ts: new Date(asOfMs).toISOString() }, context)
  const isFuture = (event: LogEvent) => asOfMs != null && timestamp(event.ts) > asOfMs

  const orderedEvents = sortIntraopEvents(events)
  let maxEventTimestamp = timestamp(context.start)
  for (const event of orderedEvents) {
    const col = intraopEventColumn(event, context)
    const future = isFuture(event)
    if (!future) {
      maxEventColumn = Math.max(maxEventColumn, col)
      maxEventTimestamp = Math.max(maxEventTimestamp, timestamp(event.ts))
    }

    if (event.type === "vital") {
      while (vitals.length <= col) vitals.push({})
      vitals[col] = {
        systolic: event.systolic,
        diastolic: event.diastolic,
        heartRate: event.heartRate,
        spO2: event.spO2,
        etco2: event.etco2,
        temp: event.temp,
        // Named explicitly like the rest, which is why they were missed: a
        // reading saved and exported correctly and then vanished from the
        // chart, because this list rebuilds the cell and stopped at bgl.
        bis: event.bis,
        tofRatio: event.tofRatio,
        cvp: event.cvp,
        eventId: event.id,
        ...(event.autoFilled ? { autoFilled: true } : {}),
      }
      continue
    }

    if (event.type === "drug") {
      drugs.push({
        eventId: event.id,
        colIdx: col,
        name: event.name ?? "",
        // metadataJson stores whatever the writer sent, verbatim, and every
        // real client (web, mobile, core's own reverseProjectIntraop) sends
        // `dose` for a drug event, never `value` -- but a server-side writer
        // is exactly the kind of thing that could reasonably send `value`
        // instead (it is what every OTHER event kind on this type uses), and
        // there was nothing here to catch it: the row would store, reproject
        // doseless, and print doseless, silently. The EHR importer is
        // precisely that kind of new writer, so this closes before it exists.
        dose: event.dose ?? event.value ?? "",
        unit: event.unit ?? "",
        drugId: event.drugId,
        atcCode: event.atcCode,
        inn: event.inn,
        route: event.drugRoute,
        concentration: event.concentration,
        concentrationValue: event.concentrationValue,
        concentrationUnit: event.concentrationUnit,
        formulation: event.formulation,
        calculationBasis: event.calculationBasis,
        calculationWeightKg: event.calculationWeightKg,
        calculationMethod: event.calculationMethod,
        clinicalRuleKey: event.clinicalRuleKey,
        clinicalRuleVersion: event.clinicalRuleVersion,
        clinicalRuleSourceIds: event.clinicalRuleSourceIds,
        clinicalPresetId: event.clinicalPresetId,
        clinicalPresetVersion: event.clinicalPresetVersion,
        clinicalPresetScope: event.clinicalPresetScope,
        ...(future ? { planned: true } : {}),
      })
      continue
    }

    if (event.type === "infusion_start" && event.infId) {
      const entry: ActiveInfusionEntry = {
        startCol: col,
        event,
        initialRate: event.rate ?? "0",
        rateChanges: [],
      }
      if (future) {
        infusions.push({ ...infusionSegment(event.infId, entry, col, false), planned: true })
        continue
      }
      activeInfusions.set(event.infId, entry)
      continue
    }

    if (event.type === "infusion_rate" && event.infId) {
      const active = activeInfusions.get(event.infId)
      if (active && !future) {
        active.rateChanges.push({
          eventId: event.id,
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
        if (future) {
          active.plannedStopCol ??= col
          active.stopEventId ??= event.id
        } else {
          infusions.push({ ...infusionSegment(event.infId, active, col, true), stopEventId: event.id, ...(event.endCaseStop ? { endCaseStop: true } : {}) })
          activeInfusions.delete(event.infId)
        }
      }
      continue
    }

    if (event.type === "fluid_start" && event.fluidId) {
      const fluidEntryMode = isBloodProductFluid({
        name: event.name,
        category: event.category,
        concentration: event.concentration,
      })
        ? "VOLUME"
        : normalizeFluidEntryMode(event.fluidEntryMode)
      const entry: ActiveFluidEntry = {
        startCol: col,
        startTs: event.ts,
        event: { ...event, fluidEntryMode },
        initialRate: event.rate ?? "0",
        rateChanges: [],
      }
      if (future) {
        fluids.push({ ...fluidSegment(event.fluidId, entry, col, event.ts, false), planned: true, volume: "0" })
        continue
      }
      activeFluids.set(event.fluidId, entry)
      continue
    }

    if (event.type === "fluid_rate" && event.fluidId) {
      const active = activeFluids.get(event.fluidId)
      if (active && !future && active.event.fluidEntryMode === "RATE") {
        active.rateChanges.push({
          eventId: event.id,
          col,
          ts: event.ts,
          rate: finiteNumber(event.rate),
          unit: event.unit ?? active.event.unit ?? "mL/h",
        })
      }
      continue
    }

    if (event.type === "fluid_end" && event.fluidId) {
      const active = activeFluids.get(event.fluidId)
      if (active) {
        if (future) {
          active.plannedStopCol ??= col
          active.stopEventId ??= event.id
        } else {
          fluids.push({ ...fluidSegment(event.fluidId, active, col, event.ts, true, event), stopEventId: event.id, ...(event.endCaseStop ? { endCaseStop: true } : {}) })
          activeFluids.delete(event.fluidId)
        }
      }
      continue
    }

    if (event.type === "agent_start" && event.name) {
      if (future) {
        agents.push({
          ...agentSegment({
            name: event.name,
            color: event.color ?? "#a855f7",
            startEventId: event.id,
            startCol: col,
            percent: event.value == null ? undefined : finiteNumber(event.value),
          }, col, false),
          planned: true,
        })
        continue
      }
      // Events saved before 1.4.9 keep their meaning: one agent at a time,
      // and starting a different one ended the previous without a stop event.
      if (event.agentMode !== "concurrent") {
        for (const [name, running] of activeAgents) {
          if (name === event.name) continue
          agents.push(agentSegment(running, col, true))
          activeAgents.delete(name)
        }
      }
      const running = activeAgents.get(event.name)
      if (!running) {
        activeAgents.set(event.name, {
          name: event.name,
          color: event.color ?? "#a855f7",
          startEventId: event.id,
          startCol: col,
          percent: event.value == null ? undefined : finiteNumber(event.value),
        })
      } else if (event.value != null) {
        running.percent = finiteNumber(event.value)
      }
      continue
    }

    if (event.type === "agent_stop") {
      // A 1.4.9 stop names its agent. An older stop may not; under the old
      // one-agent rule there was only ever one running to stop.
      const targets = event.name && activeAgents.has(event.name)
        ? [event.name]
        : event.agentMode === "concurrent" ? [] : [...activeAgents.keys()]
      for (const name of targets) {
        const running = activeAgents.get(name)!
        if (future) {
          running.plannedStopCol ??= col
          running.stopEventId ??= event.id
        } else {
          agents.push({ ...agentSegment(running, col, true), stopEventId: event.id, ...(event.endCaseStop ? { endCaseStop: true } : {}) })
          activeAgents.delete(name)
        }
      }
      continue
    }

    if (event.type === "gas_start") {
      const fractions = gasFractions(event.carrierGas, event.fio2)
      const next: ActiveGasEntry = {
        id: `gas-${event.id}`,
        startEventId: event.id,
        startCol: col,
        fgf: finiteNumber(event.fgf),
        carrierGas: event.carrierGas ?? null,
        fio2: fractions.fio2,
        fiAir: event.fiAir ?? fractions.fiAir,
        fiN2O: event.fiN2O ?? fractions.fiN2O,
        settingsChanges: [],
      }
      if (future) {
        gasSettings.push({ ...gasSegment(next, col, false), planned: true })
        continue
      }
      if (activeGas) gasSettings.push(gasSegment(activeGas, col, true))
      activeGas = next
      continue
    }

    if (event.type === "gas_change" && activeGas && !future) {
      const carrierGas = event.carrierGas ?? activeGas.carrierGas
      const fractions = gasFractions(carrierGas, event.fio2 ?? activeGas.fio2)
      activeGas.settingsChanges.push({
        eventId: event.id,
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
      if (future) {
        activeGas.plannedStopCol ??= col
        activeGas.stopEventId ??= event.id
      } else {
        gasSettings.push({ ...gasSegment(activeGas, col, true), stopEventId: event.id, ...(event.endCaseStop ? { endCaseStop: true } : {}) })
        activeGas = null
      }
      continue
    }

    if (event.type === "clinical_event" && event.label) {
      clinicalEvents.push({
        eventId: event.id,
        colIdx: col,
        label: event.label,
        color: event.color ?? "#64748b",
        ...(future ? { planned: true } : {}),
      })
      continue
    }

    if (event.type === "position_change" && event.name && !future) {
      if (!activePosition || activePosition.position !== event.name) {
        if (activePosition) positions.push({ ...activePosition, endCol: col })
        activePosition = { position: event.name, startCol: col, startEventId: event.id }
      }
      continue
    }

    if (event.type === "phase_change" && event.name && !future) {
      if (!activePhase || activePhase.phase !== event.name) {
        if (activePhase) phases.push({ ...activePhase, endCol: col })
        activePhase = { phase: event.name, startCol: col, startEventId: event.id }
      }
    }
  }

  // A running item ends in the column of "now" -- or of the case end once the
  // case has ended -- inclusive, never one column beyond it, and never
  // stretched by a future-dated event. Without a reading time (a caller
  // projecting a stored record) it ends at the last event.
  const openEnd = Math.max(asOfCol ?? maxEventColumn, 0)
  const openThroughTs = new Date(asOfMs ?? maxEventTimestamp).toISOString()

  for (const [id, active] of activeInfusions) {
    infusions.push(withPlannedStop(infusionSegment(id, active, Math.max(openEnd, active.startCol), false), active.plannedStopCol, active.stopEventId))
  }
  for (const [id, active] of activeFluids) {
    fluids.push(withPlannedStop(fluidSegment(id, active, Math.max(openEnd, active.startCol), openThroughTs, false), active.plannedStopCol, active.stopEventId))
  }
  for (const running of activeAgents.values()) {
    agents.push(withPlannedStop(agentSegment(running, Math.max(openEnd, running.startCol), false), running.plannedStopCol, running.stopEventId))
  }
  if (activeGas) gasSettings.push(withPlannedStop(gasSegment(activeGas, Math.max(openEnd, activeGas.startCol), false), activeGas.plannedStopCol, activeGas.stopEventId))
  if (activePosition) positions.push({ ...activePosition, endCol: Math.max(openEnd, activePosition.startCol) })
  if (activePhase) phases.push({ ...activePhase, endCol: Math.max(openEnd, activePhase.startCol) })

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

/** The instant a chart is read at: the case end if ended, otherwise now, otherwise none. */
export function asOfInstant(context: Pick<IntraopProjectionContext, "endedAt" | "openThrough">): number | null {
  if (context.endedAt != null) return timestamp(context.endedAt)
  if (context.openThrough != null) return timestamp(context.openThrough)
  return null
}

type ActiveInfusionEntry = {
  startCol: number
  event: LogEvent
  initialRate: string
  rateChanges: NonNullable<TimetableInfusion["rateChanges"]>
  plannedStopCol?: number
  stopEventId?: string
}

type ActiveFluidEntry = {
  startCol: number
  startTs: string
  event: LogEvent
  initialRate: string
  rateChanges: NonNullable<TimetableFluid["rateChanges"]>
  plannedStopCol?: number
  stopEventId?: string
}

type ActiveAgentEntry = {
  name: string
  color: string
  startEventId?: string
  startCol: number
  percent?: number
  plannedStopCol?: number
  stopEventId?: string
}

type ActiveGasEntry = {
  id: string
  startCol: number
  fgf: number
  carrierGas: string | null
  fio2: number
  fiAir: number
  fiN2O: number
  settingsChanges: NonNullable<GasSettingsSegment["settingsChanges"]>
  plannedStopCol?: number
  startEventId?: string
  stopEventId?: string
}

function agentSegment(running: ActiveAgentEntry, endCol: number, stopped: boolean): AgentSegment {
  return {
    name: running.name,
    color: running.color,
    ...(running.startEventId ? { startEventId: running.startEventId } : {}),
    startCol: running.startCol,
    endCol,
    ...(running.percent !== undefined ? { percent: running.percent } : {}),
    ...(stopped ? { stopped: true } : {}),
  }
}

function withPlannedStop<T extends { plannedStopCol?: number; stopEventId?: string }>(
  segment: T,
  plannedStopCol: number | undefined,
  stopEventId?: string,
): T {
  return plannedStopCol == null ? segment : { ...segment, plannedStopCol, ...(stopEventId ? { stopEventId } : {}) }
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
    startEventId: active.event.id,
    name: active.event.name ?? "",
    rate: finiteNumber(active.initialRate),
    unit: active.event.unit ?? "",
    color: active.event.color ?? "#8b5cf6",
    startCol: active.startCol,
    endCol,
    stopped,
    concentration: active.event.concentration,
    formulation: active.event.formulation,
    route: active.event.drugRoute,
    drugId: active.event.drugId,
    atcCode: active.event.atcCode,
    inn: active.event.inn,
    clinicalRuleKey: active.event.clinicalRuleKey,
    clinicalRuleVersion: active.event.clinicalRuleVersion,
    clinicalRuleSourceIds: active.event.clinicalRuleSourceIds,
    clinicalPresetId: active.event.clinicalPresetId,
    clinicalPresetVersion: active.event.clinicalPresetVersion,
    clinicalPresetScope: active.event.clinicalPresetScope,
    rateChanges: active.rateChanges.length ? active.rateChanges : undefined,
  }
}

function fluidSegment(
  id: string,
  active: {
    startCol: number
    startTs: string
    event: LogEvent
    initialRate: string
    rateChanges: NonNullable<TimetableFluid["rateChanges"]>
  },
  endCol: number,
  asOfTs: string,
  stopped: boolean,
  endEvent?: LogEvent,
): TimetableFluid {
  const fluidEntryMode = normalizeFluidEntryMode(active.event.fluidEntryMode)
  const legacyEndVolume = fluidEntryMode === "VOLUME" ? endEvent?.volume : undefined
  const administeredVolumeMl = endEvent?.administeredVolumeMl
    ?? (legacyEndVolume == null || legacyEndVolume === "" || Number.isNaN(Number(legacyEndVolume))
      ? active.event.administeredVolumeMl
      : Number(legacyEndVolume))
  const bagVolumeMl = active.event.bagVolumeMl
    ?? (active.event.volume == null || active.event.volume === "" || Number.isNaN(Number(active.event.volume))
      ? undefined
      : Number(active.event.volume))
  const volumeMl = calculateFluidVolumeMl({
    fluidEntryMode,
    bagVolumeMl,
    administeredVolumeMl,
    legacyVolume: active.event.volume,
    startTs: active.startTs,
    endTs: asOfTs,
    rate: active.initialRate,
    rateChanges: active.rateChanges,
  })
  return {
    id,
    startEventId: active.event.id,
    name: active.event.name ?? "",
    category: active.event.category ?? "",
    volume: String(volumeMl),
    color: active.event.color ?? "#06b6d4",
    startCol: active.startCol,
    endCol,
    stopped,
    fluidEntryMode,
    startTs: active.startTs,
    ...(stopped ? { endTs: asOfTs } : {}),
    ...(bagVolumeMl != null ? { bagVolumeMl } : {}),
    ...(administeredVolumeMl != null ? { administeredVolumeMl } : {}),
    ...(active.event.concentration != null ? { concentration: active.event.concentration } : {}),
    ...(fluidEntryMode === "RATE"
      ? {
          rate: finiteNumber(active.initialRate),
          unit: active.event.unit ?? "mL/h",
          rateChanges: active.rateChanges.length ? active.rateChanges : undefined,
        }
      : {}),
    clinicalRuleKey: active.event.clinicalRuleKey,
    clinicalRuleVersion: active.event.clinicalRuleVersion,
    clinicalRuleSourceIds: active.event.clinicalRuleSourceIds,
    clinicalPresetId: active.event.clinicalPresetId,
    clinicalPresetVersion: active.event.clinicalPresetVersion,
    clinicalPresetScope: active.event.clinicalPresetScope,
  }
}

function gasSegment(
  active: {
    id: string
    startEventId?: string
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
    ...(active.startEventId ? { startEventId: active.startEventId } : {}),
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
      concentration: drug.concentration,
      concentrationValue: drug.concentrationValue,
      concentrationUnit: drug.concentrationUnit,
      formulation: drug.formulation,
      calculationBasis: drug.calculationBasis,
      calculationWeightKg: drug.calculationWeightKg,
      calculationMethod: drug.calculationMethod,
      clinicalRuleKey: drug.clinicalRuleKey,
      clinicalRuleVersion: drug.clinicalRuleVersion,
      clinicalRuleSourceIds: drug.clinicalRuleSourceIds,
      clinicalPresetId: drug.clinicalPresetId,
      clinicalPresetVersion: drug.clinicalPresetVersion,
      clinicalPresetScope: drug.clinicalPresetScope,
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
      formulation: infusion.formulation,
      drugRoute: infusion.route,
      drugId: infusion.drugId,
      atcCode: infusion.atcCode,
      inn: infusion.inn,
      clinicalRuleKey: infusion.clinicalRuleKey,
      clinicalRuleVersion: infusion.clinicalRuleVersion,
      clinicalRuleSourceIds: infusion.clinicalRuleSourceIds,
      clinicalPresetId: infusion.clinicalPresetId,
      clinicalPresetVersion: infusion.clinicalPresetVersion,
      clinicalPresetScope: infusion.clinicalPresetScope,
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
    const fluidEntryMode = normalizeFluidEntryMode(fluid.fluidEntryMode)
    events.push(create({
      type: "fluid_start",
      ts: fluid.startTs && timestamp(fluid.startTs) > 0
        ? fluid.startTs
        : timestampFor(fluid.startCol),
      fluidId: fluid.id,
      name: fluid.name,
      category: fluid.category,
      volume: fluid.volume,
      fluidEntryMode,
      bagVolumeMl: fluid.bagVolumeMl,
      concentration: fluid.concentration,
      rate: fluidEntryMode === "RATE" && fluid.rate != null ? String(fluid.rate) : undefined,
      unit: fluidEntryMode === "RATE" ? fluid.unit ?? "mL/h" : undefined,
      color: fluid.color,
      clinicalRuleKey: fluid.clinicalRuleKey,
      clinicalRuleVersion: fluid.clinicalRuleVersion,
      clinicalRuleSourceIds: fluid.clinicalRuleSourceIds,
      clinicalPresetId: fluid.clinicalPresetId,
      clinicalPresetVersion: fluid.clinicalPresetVersion,
      clinicalPresetScope: fluid.clinicalPresetScope,
    }))
    if (fluidEntryMode === "RATE") {
      for (const change of fluid.rateChanges ?? []) {
        events.push(create({
          type: "fluid_rate",
          ts: timestamp(change.ts) > 0 ? change.ts : timestampFor(change.col),
          fluidId: fluid.id,
          rate: String(change.rate),
          unit: change.unit,
        }))
      }
    }
    if (fluid.stopped) {
      events.push(create({
        type: "fluid_end",
        ts: fluid.endTs && timestamp(fluid.endTs) > 0
          ? fluid.endTs
          : timestampFor(fluid.endCol),
        fluidId: fluid.id,
        ...(fluid.administeredVolumeMl != null
          ? { administeredVolumeMl: fluid.administeredVolumeMl }
          : {}),
        ...(fluidEntryMode === "VOLUME" ? { volume: fluid.volume } : {}),
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

/**
 * What is running at an instant. With `asOf`, events after it (planned,
 * future-dated) are not applied: a planned start is not running yet and a
 * planned stop has not stopped anything yet.
 */
export function rebuildIntraopActiveState(
  events: LogEvent[],
  asOf?: Date | string | number | null,
): IntraopActiveState {
  const infusions = new Map<string, ActiveInfusion>()
  const fluids = new Map<string, ActiveFluid>()
  const agents = new Map<string, NonNullable<ActiveAgent>>()
  let gas: ActiveGasSettings = null
  const asOfMs = asOf == null ? null : timestamp(asOf)

  for (const event of sortIntraopEvents(events)) {
    if (asOfMs != null && timestamp(event.ts) > asOfMs) continue
    if (event.type === "infusion_start" && event.infId) {
      infusions.set(event.infId, {
        infId: event.infId,
        name: event.name ?? "",
        rate: event.rate ?? "",
        unit: event.unit ?? "",
        color: event.color ?? "#8b5cf6",
        concentration: event.concentration,
        formulation: event.formulation,
        route: event.drugRoute,
        drugId: event.drugId,
        atcCode: event.atcCode,
        inn: event.inn,
        clinicalRuleKey: event.clinicalRuleKey,
        clinicalRuleVersion: event.clinicalRuleVersion,
        clinicalRuleSourceIds: event.clinicalRuleSourceIds,
        clinicalPresetId: event.clinicalPresetId,
        clinicalPresetVersion: event.clinicalPresetVersion,
        clinicalPresetScope: event.clinicalPresetScope,
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
      const fluidEntryMode = isBloodProductFluid({
        name: event.name,
        category: event.category,
        concentration: event.concentration,
      })
        ? "VOLUME"
        : normalizeFluidEntryMode(event.fluidEntryMode)
      const bagVolumeMl = event.bagVolumeMl
        ?? (event.volume == null || event.volume === "" || Number.isNaN(Number(event.volume))
          ? undefined
          : Number(event.volume))
      fluids.set(event.fluidId, {
        fluidId: event.fluidId,
        name: event.name ?? "",
        category: event.category,
        volume: String(calculateFluidVolumeMl({
          fluidEntryMode,
          bagVolumeMl,
          administeredVolumeMl: event.administeredVolumeMl,
          legacyVolume: event.volume,
          startTs: event.ts,
          endTs: event.ts,
          rate: event.rate,
        })),
        color: event.color ?? "#06b6d4",
        fluidEntryMode,
        startTs: event.ts,
        bagVolumeMl,
        administeredVolumeMl: event.administeredVolumeMl,
        concentration: event.concentration,
        initialRate: fluidEntryMode === "RATE" ? event.rate ?? "0" : undefined,
        rate: fluidEntryMode === "RATE" ? event.rate ?? "0" : undefined,
        unit: fluidEntryMode === "RATE" ? event.unit ?? "mL/h" : undefined,
        rateChanges: fluidEntryMode === "RATE" ? [] : undefined,
        clinicalRuleKey: event.clinicalRuleKey,
        clinicalRuleVersion: event.clinicalRuleVersion,
        clinicalRuleSourceIds: event.clinicalRuleSourceIds,
        clinicalPresetId: event.clinicalPresetId,
        clinicalPresetVersion: event.clinicalPresetVersion,
        clinicalPresetScope: event.clinicalPresetScope,
      })
    } else if (event.type === "fluid_rate" && event.fluidId) {
      const active = fluids.get(event.fluidId)
      if (active?.fluidEntryMode === "RATE") {
        active.rate = event.rate ?? active.rate
        active.unit = event.unit ?? active.unit ?? "mL/h"
        active.rateChanges = [
          ...(active.rateChanges ?? []),
          {
            ts: event.ts,
            rate: event.rate ?? active.rate ?? "0",
            unit: event.unit ?? active.unit ?? "mL/h",
          },
        ]
      }
    } else if (event.type === "fluid_end" && event.fluidId) {
      fluids.delete(event.fluidId)
    } else if (event.type === "agent_start" && event.name) {
      // Events saved before 1.4.9: one agent at a time (see projectIntraopEvents).
      if (event.agentMode !== "concurrent") {
        for (const name of [...agents.keys()]) if (name !== event.name) agents.delete(name)
      }
      const running = agents.get(event.name)
      const percent = event.value == null ? running?.percent : finiteNumber(event.value)
      agents.delete(event.name)
      agents.set(event.name, {
        name: event.name,
        color: event.color ?? running?.color ?? "#a855f7",
        ...(percent !== undefined ? { percent } : {}),
      })
    } else if (event.type === "agent_stop") {
      if (event.name && agents.has(event.name)) agents.delete(event.name)
      else if (event.agentMode !== "concurrent") agents.clear()
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

  const runningAgents = [...agents.values()]
  return {
    infusions: [...infusions.values()],
    fluids: [...fluids.values()],
    agents: runningAgents,
    agent: runningAgents[runningAgents.length - 1] ?? null,
    gas,
  }
}
