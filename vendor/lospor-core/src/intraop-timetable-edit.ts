import { intraopStampForColumn } from "./intraop-commands"
import type {
  AgentSegment,
  ClinicalEvent,
  GasSettingsSegment,
  LogEvent,
  PhaseSegment,
  PositionSegment,
  TimetableData,
  TimetableDrug,
  TimetableFluid,
  TimetableInfusion,
  VitalsEntry,
} from "./intraop-types"

/**
 * Turns an edit of a projected chart into event operations (1.4.9).
 *
 * The saved event log is the only source of truth; a chart is its projection.
 * An editor that works on the chart (the web timetable: drag a bar, type a
 * vital, delete a dose) proposes the chart it wants. This compares it with the
 * chart it was given and, through the event references every drawn item
 * carries, writes exactly the events that changed:
 *
 * - an item without a reference is new and gets new events;
 * - an item whose reference disappeared is deleted, a start with its changes
 *   and its stop;
 * - a moved item has only its own event re-timed. Nothing else moves.
 *
 * Times use the Core stamp rule: the exact minute in the row "now" falls in,
 * otherwise the start of the row. A change the log cannot express (resizing a
 * bar that is still running) is simply not written, and the chart snaps back.
 */

export type IntraopEventOps = {
  add: LogEvent[]
  update: LogEvent[]
  remove: string[]
}

export type TimetableEditContext = {
  log: LogEvent[]
  before: TimetableData
  after: TimetableData
  chartStart: Date | string | number
  now: Date | string | number
  newId: () => string
}

const DRUG_FIELDS = [
  "drugId", "atcCode", "inn", "concentration", "concentrationValue", "concentrationUnit", "formulation",
  "calculationBasis", "calculationWeightKg", "calculationMethod", "clinicalRuleKey", "clinicalRuleVersion",
  "clinicalRuleSourceIds", "clinicalPresetId", "clinicalPresetVersion", "clinicalPresetScope",
] as const

const VITAL_KEYS = ["systolic", "diastolic", "heartRate", "spO2", "etco2", "temp", "bis", "tofRatio", "cvp"] as const

function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function timetableEditToEventOps(context: TimetableEditContext): IntraopEventOps {
  const ops: IntraopEventOps = { add: [], update: [], remove: [] }
  const byId = new Map(context.log.map(event => [event.id, event]))
  const stamp = (column: number) => intraopStampForColumn({ chartStart: context.chartStart, column, now: context.now })
  const updated = new Map<string, LogEvent>()
  const update = (id: string | undefined, patch: Partial<LogEvent>) => {
    if (!id) return
    const current = updated.get(id) ?? byId.get(id)
    if (!current) return
    updated.set(id, defined({ ...current, ...patch }))
  }
  const add = (event: Omit<LogEvent, "id">) => { ops.add.push(defined({ ...event, id: context.newId() }) as LogEvent) }
  const remove = (...ids: (string | undefined)[]) => { for (const id of ids) if (id && byId.has(id)) ops.remove.push(id) }

  drugs(context, { stamp, update, add, remove })
  vitals(context, { stamp, update, add, remove })
  clinicalEvents(context, { stamp, update, add, remove })
  infusions(context, { stamp, update, add, remove })
  fluids(context, { stamp, update, add, remove })
  agents(context, { stamp, update, add, remove })
  gas(context, { stamp, update, add, remove })
  markers(context, { stamp, update, add, remove }, "positions")
  markers(context, { stamp, update, add, remove }, "phases")

  const removed = new Set(ops.remove)
  ops.remove = [...removed]
  ops.update = [...updated.values()].filter(event => !removed.has(event.id) && !sameJson(event, byId.get(event.id)))
  return ops
}

type Writers = {
  stamp: (column: number) => string
  update: (id: string | undefined, patch: Partial<LogEvent>) => void
  add: (event: Omit<LogEvent, "id">) => void
  remove: (...ids: (string | undefined)[]) => void
}

/** Items keyed by an event reference; a copied reference (duplicate) counts as new. */
function matchByRef<T>(before: T[], after: T[], ref: (item: T) => string | undefined) {
  const beforeByRef = new Map<string, T>()
  for (const item of before) {
    const id = ref(item)
    if (id) beforeByRef.set(id, item)
  }
  const seen = new Set<string>()
  const pairs: { before?: T; after: T }[] = []
  for (const item of after) {
    const id = ref(item)
    if (id && beforeByRef.has(id) && !seen.has(id)) {
      seen.add(id)
      pairs.push({ before: beforeByRef.get(id), after: item })
    } else {
      pairs.push({ after: item })
    }
  }
  const gone = [...beforeByRef.entries()].filter(([id]) => !seen.has(id)).map(([, item]) => item)
  return { pairs, gone }
}

function drugPatch(drug: TimetableDrug): Partial<LogEvent> {
  const patch: Partial<LogEvent> = { name: drug.name, dose: drug.dose, unit: drug.unit, drugRoute: drug.route }
  for (const field of DRUG_FIELDS) (patch as Record<string, unknown>)[field] = drug[field]
  return patch
}

function drugs(context: TimetableEditContext, w: Writers) {
  const { pairs, gone } = matchByRef(context.before.drugs ?? [], context.after.drugs ?? [], drug => drug.eventId)
  for (const drug of gone) w.remove(drug.eventId)
  for (const { before, after } of pairs) {
    if (!before) {
      w.add({ type: "drug", ts: w.stamp(after.colIdx), ...drugPatch(after) })
      continue
    }
    if (sameJson(before, after)) continue
    w.update(after.eventId, {
      ...drugPatch(after),
      ...(before.colIdx !== after.colIdx ? { ts: w.stamp(after.colIdx) } : {}),
    })
  }
}

function vitalValues(entry: VitalsEntry | undefined): Partial<Record<(typeof VITAL_KEYS)[number], number>> {
  const values: Partial<Record<(typeof VITAL_KEYS)[number], number>> = {}
  for (const key of VITAL_KEYS) if (typeof entry?.[key] === "number") values[key] = entry[key]
  return values
}

function vitals(context: TimetableEditContext, w: Writers) {
  const before = context.before.vitals ?? []
  const after = context.after.vitals ?? []
  for (let column = 0; column < Math.max(before.length, after.length); column += 1) {
    const was = vitalValues(before[column])
    const now = vitalValues(after[column])
    if (sameJson(was, now)) continue
    const eventId = before[column]?.eventId
    const empty = Object.keys(now).length === 0
    if (eventId) {
      if (empty) { w.remove(eventId); continue }
      const cleared = Object.fromEntries(VITAL_KEYS.map(key => [key, undefined]))
      // A clinician's edit makes the reading theirs: it is no longer auto-filled.
      w.update(eventId, { ...cleared, ...now, autoFilled: after[column]?.autoFilled ? true : undefined })
    } else if (!empty) {
      w.add({ type: "vital", ts: w.stamp(column), ...now, ...(after[column]?.autoFilled ? { autoFilled: true } : {}) })
    }
  }
}

function clinicalEvents(context: TimetableEditContext, w: Writers) {
  const { pairs, gone } = matchByRef<ClinicalEvent>(context.before.clinicalEvents ?? [], context.after.clinicalEvents ?? [], item => item.eventId)
  for (const item of gone) w.remove(item.eventId)
  for (const { before, after } of pairs) {
    if (!before) {
      w.add({ type: "clinical_event", ts: w.stamp(after.colIdx), label: after.label, color: after.color })
      continue
    }
    if (sameJson(before, after)) continue
    w.update(after.eventId, {
      label: after.label,
      color: after.color,
      ...(before.colIdx !== after.colIdx ? { ts: w.stamp(after.colIdx) } : {}),
    })
  }
}

type RateChange = { eventId?: string; col: number }

/** Start/stop/change events of one bar, shared by infusions, fluids, agents and gas. */
function segmentLifecycle<S extends { startEventId?: string; stopEventId?: string; endCaseStop?: boolean; startCol: number; endCol: number; stopped?: boolean; planned?: boolean; plannedStopCol?: number }>(
  w: Writers,
  before: S,
  after: S,
  startPatch: Partial<LogEvent>,
  stop: () => Omit<LogEvent, "id" | "ts">,
  changes?: {
    before: RateChange[]
    after: RateChange[]
    add: (change: RateChange) => Omit<LogEvent, "id" | "ts">
    patch: (change: RateChange) => Partial<LogEvent>
  },
) {
  const moved = before.startCol !== after.startCol
  w.update(after.startEventId, { ...startPatch, ...(moved ? { ts: w.stamp(after.startCol) } : {}) })

  // The bar's end is a stop event. A running bar's end is "now" and is not
  // written; stopping it (or planning a stop) writes one; resuming removes it.
  const wasStopped = !!before.stopped || before.plannedStopCol != null
  const beforeEnd = before.plannedStopCol ?? before.endCol
  const afterEnd = after.plannedStopCol ?? after.endCol
  const nowStopped = !!after.stopped || after.plannedStopCol != null
  if (wasStopped && !nowStopped) {
    w.remove(before.stopEventId)
  } else if (!wasStopped && nowStopped) {
    w.add({ ...stop(), ...(after.endCaseStop ? { endCaseStop: true } : {}), ts: w.stamp(Math.max(afterEnd, after.startCol)) })
  } else if (wasStopped && nowStopped && beforeEnd !== afterEnd) {
    w.update(before.stopEventId, { ts: w.stamp(Math.max(afterEnd, after.startCol)) })
  }

  if (changes) {
    const { pairs, gone } = matchByRef(changes.before, changes.after, change => change.eventId)
    for (const change of gone) w.remove(change.eventId)
    for (const { before: was, after: now } of pairs) {
      if (!was) w.add({ ...changes.add(now), ts: w.stamp(now.col) })
      else if (!sameJson(was, now)) w.update(now.eventId, { ...changes.patch(now), ...(was.col !== now.col ? { ts: w.stamp(now.col) } : {}) })
    }
  }
}

function removeSegment(w: Writers, segment: { startEventId?: string; stopEventId?: string }, changes: RateChange[] = []) {
  w.remove(segment.startEventId, segment.stopEventId, ...changes.map(change => change.eventId))
}

function infusionStart(item: TimetableInfusion): Partial<LogEvent> {
  return {
    infId: item.id, name: item.name, rate: String(item.rate), unit: item.unit, color: item.color,
    concentration: item.concentration, formulation: item.formulation, drugRoute: item.route,
    drugId: item.drugId, atcCode: item.atcCode, inn: item.inn,
    clinicalRuleKey: item.clinicalRuleKey, clinicalRuleVersion: item.clinicalRuleVersion,
    clinicalRuleSourceIds: item.clinicalRuleSourceIds, clinicalPresetId: item.clinicalPresetId,
    clinicalPresetVersion: item.clinicalPresetVersion, clinicalPresetScope: item.clinicalPresetScope,
  }
}

function infusions(context: TimetableEditContext, w: Writers) {
  const { pairs, gone } = matchByRef(context.before.infusions ?? [], context.after.infusions ?? [], item => item.startEventId)
  for (const item of gone) removeSegment(w, item, item.rateChanges)
  for (const { before, after } of pairs) {
    const stop = () => ({ type: "infusion_stop" as const, infId: after.id, name: after.name, color: after.color })
    const changeOf = (change: RateChange) => {
      const rate = change as NonNullable<TimetableInfusion["rateChanges"]>[number]
      return { rate: String(rate.rate), unit: rate.unit, concentration: rate.concentration }
    }
    if (!before) {
      w.add({ type: "infusion_start", ts: w.stamp(after.startCol), ...infusionStart(after) })
      for (const change of after.rateChanges ?? []) w.add({ type: "infusion_rate", infId: after.id, name: after.name, ...changeOf(change), ts: w.stamp(change.col) })
      if (after.stopped) w.add({ ...stop(), ts: w.stamp(Math.max(after.endCol, after.startCol)) })
      continue
    }
    if (sameJson(before, after)) continue
    segmentLifecycle(w, before, after, sameJson(infusionStart(before), infusionStart(after)) ? {} : infusionStart(after), stop, {
      before: before.rateChanges ?? [],
      after: after.rateChanges ?? [],
      add: change => ({ type: "infusion_rate", infId: after.id, name: after.name, ...changeOf(change) }),
      patch: changeOf,
    })
  }
}

function fluidStart(item: TimetableFluid): Partial<LogEvent> {
  return {
    fluidId: item.id, name: item.name, category: item.category, color: item.color, volume: item.bagVolumeMl != null ? String(item.bagVolumeMl) : item.volume,
    fluidEntryMode: item.fluidEntryMode, bagVolumeMl: item.bagVolumeMl,
    rate: item.rate == null ? undefined : String(item.rate), unit: item.unit, concentration: item.concentration,
    clinicalRuleKey: item.clinicalRuleKey, clinicalRuleVersion: item.clinicalRuleVersion,
    clinicalRuleSourceIds: item.clinicalRuleSourceIds, clinicalPresetId: item.clinicalPresetId,
    clinicalPresetVersion: item.clinicalPresetVersion, clinicalPresetScope: item.clinicalPresetScope,
  }
}

function fluids(context: TimetableEditContext, w: Writers) {
  const { pairs, gone } = matchByRef(context.before.fluids ?? [], context.after.fluids ?? [], item => item.startEventId)
  for (const item of gone) removeSegment(w, item, item.rateChanges)
  for (const { before, after } of pairs) {
    const stop = () => defined({
      type: "fluid_end" as const, fluidId: after.id, name: after.name, color: after.color, fluidEntryMode: after.fluidEntryMode,
      administeredVolumeMl: after.administeredVolumeMl,
      volume: after.administeredVolumeMl != null ? String(after.administeredVolumeMl) : undefined,
    })
    const changeOf = (change: RateChange) => {
      const rate = change as NonNullable<TimetableFluid["rateChanges"]>[number]
      return { rate: String(rate.rate), unit: rate.unit }
    }
    if (!before) {
      w.add({ type: "fluid_start", ts: w.stamp(after.startCol), ...fluidStart(after) })
      for (const change of after.rateChanges ?? []) w.add({ type: "fluid_rate", fluidId: after.id, name: after.name, fluidEntryMode: "RATE", ...changeOf(change), ts: w.stamp(change.col) })
      if (after.stopped) w.add({ ...stop(), ts: w.stamp(Math.max(after.endCol, after.startCol)) })
      continue
    }
    if (sameJson(before, after)) continue
    segmentLifecycle(w, before, after, sameJson(fluidStart(before), fluidStart(after)) ? {} : fluidStart(after), stop, {
      before: before.rateChanges ?? [],
      after: after.rateChanges ?? [],
      add: change => ({ type: "fluid_rate", fluidId: after.id, name: after.name, fluidEntryMode: "RATE", ...changeOf(change) }),
      patch: changeOf,
    })
    if (before.administeredVolumeMl !== after.administeredVolumeMl && after.stopped) {
      w.update(before.stopEventId, {
        administeredVolumeMl: after.administeredVolumeMl,
        volume: after.administeredVolumeMl != null ? String(after.administeredVolumeMl) : undefined,
      })
    }
  }
}

function agents(context: TimetableEditContext, w: Writers) {
  const { pairs, gone } = matchByRef<AgentSegment>(context.before.agents ?? [], context.after.agents ?? [], item => item.startEventId)
  for (const item of gone) removeSegment(w, item)
  for (const { before, after } of pairs) {
    const start = { name: after.name, color: after.color, value: after.percent == null ? undefined : String(after.percent) }
    const stop = () => ({ type: "agent_stop" as const, name: after.name, color: after.color, agentMode: "concurrent" as const })
    if (!before) {
      w.add({ type: "agent_start", ts: w.stamp(after.startCol), ...start, agentMode: "concurrent" })
      if (after.stopped) w.add({ ...stop(), ts: w.stamp(Math.max(after.endCol, after.startCol)) })
      continue
    }
    if (sameJson(before, after)) continue
    const startChanged = before.name !== after.name || before.percent !== after.percent || before.color !== after.color
    segmentLifecycle(w, before, after, startChanged ? start : {}, stop)
  }
}

function gas(context: TimetableEditContext, w: Writers) {
  const { pairs, gone } = matchByRef<GasSettingsSegment>(context.before.gasSettings ?? [], context.after.gasSettings ?? [], item => item.startEventId)
  for (const item of gone) removeSegment(w, item, item.settingsChanges)
  for (const { before, after } of pairs) {
    const settings = (item: { fgf: number; carrierGas: string | null; fio2: number; fiAir?: number; fiN2O?: number }) =>
      ({ fgf: item.fgf, carrierGas: item.carrierGas, fio2: item.fio2, fiAir: item.fiAir, fiN2O: item.fiN2O })
    const stop = () => ({ type: "gas_stop" as const })
    if (!before) {
      w.add({ type: "gas_start", ts: w.stamp(after.startCol), ...settings(after) })
      for (const change of after.settingsChanges ?? []) w.add({ type: "gas_change", ...settings(change), ts: w.stamp(change.col) })
      if (after.stopped) w.add({ ...stop(), ts: w.stamp(Math.max(after.endCol, after.startCol)) })
      continue
    }
    if (sameJson(before, after)) continue
    segmentLifecycle(w, before, after, sameJson(settings(before), settings(after)) ? {} : settings(after), stop, {
      before: before.settingsChanges ?? [],
      after: after.settingsChanges ?? [],
      add: change => ({ type: "gas_change", ...settings(change as NonNullable<GasSettingsSegment["settingsChanges"]>[number]) }),
      patch: change => settings(change as NonNullable<GasSettingsSegment["settingsChanges"]>[number]),
    })
  }
}

function markers(context: TimetableEditContext, w: Writers, lane: "positions" | "phases") {
  const type = lane === "positions" ? "position_change" : "phase_change"
  const nameOf = (item: PositionSegment | PhaseSegment) => "position" in item ? item.position : item.phase
  const { pairs, gone } = matchByRef<PositionSegment | PhaseSegment>(context.before[lane] ?? [], context.after[lane] ?? [], item => item.startEventId)
  for (const item of gone) w.remove(item.startEventId)
  for (const { before, after } of pairs) {
    if (!before) { w.add({ type, ts: w.stamp(after.startCol), name: nameOf(after) }); continue }
    if (before.startCol === after.startCol && nameOf(before) === nameOf(after)) continue
    w.update(after.startEventId, { name: nameOf(after), ...(before.startCol !== after.startCol ? { ts: w.stamp(after.startCol) } : {}) })
  }
}

/** The log after applying operations: removals, then updates in place, then additions. */
export function applyIntraopEventOps(log: LogEvent[], ops: IntraopEventOps): LogEvent[] {
  const removed = new Set(ops.remove)
  const updates = new Map(ops.update.map(event => [event.id, event]))
  return [
    ...log.filter(event => !removed.has(event.id)).map(event => updates.get(event.id) ?? event),
    ...ops.add,
  ]
}

/** True when there is nothing to write. */
export function isEmptyIntraopEventOps(ops: IntraopEventOps): boolean {
  return ops.add.length === 0 && ops.update.length === 0 && ops.remove.length === 0
}
