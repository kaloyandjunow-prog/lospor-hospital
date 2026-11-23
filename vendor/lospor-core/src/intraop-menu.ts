import { sortIntraopEvents } from "./intraop-engine"
import { intraopItemRef, type IntraopItemKind } from "./intraop-commands"
import type { LogEvent } from "./intraop-types"

/**
 * The one menu of the intraoperative chart (10.8.0). A tap on anything in a
 * cell -- on the web chart, in the PWA's open cell, or on its line in the event
 * log -- opens these actions, in this order. The clients draw them; they never
 * decide them.
 */

export type IntraopMenuAction =
  // A running item, in a cell where it runs.
  | "stop"
  | "change_dose"
  | "change_syringe"
  | "switch_agent"
  | "fix_start"
  | "fix_end"
  | "resume"
  | "delete_here"
  | "delete_whole"
  // A cell after now.
  | "plan_change"
  | "plan_stop"
  | "remove_planned"
  // A one-off entry.
  | "repeat_dose"
  | "edit"
  | "move"
  | "delete"

function ms(value: Date | string | number): number {
  return value instanceof Date ? value.getTime() : typeof value === "number" ? value : new Date(value).getTime()
}

export type IntraopCell = {
  /** The cell's first instant. */
  start: Date | string | number
  /** The instant after the cell (start of the next one). */
  end: Date | string | number
}

export type IntraopMenuContext = {
  now: Date | string | number
  /** The case end, once there is one. */
  endedAt?: Date | string | number | null
  /** Watching a case edited elsewhere, or a finalised case: nothing to do. */
  readOnly?: boolean
}

type Run = { start: LogEvent; changes: LogEvent[]; stop: LogEvent | null }

function runsOf(events: LogEvent[], kind: IntraopItemKind, key: string): Run[] {
  const runs: Run[] = []
  let current: Run | null = null
  for (const event of sortIntraopEvents(events)) {
    const ref = intraopItemRef(event)
    if (!ref || ref.kind !== kind || ref.key !== key) continue
    if (ref.role === "start") {
      if (kind === "gas" && current && !current.stop) {
        current.changes.push(event)
        continue
      }
      current = { start: event, changes: [], stop: null }
      runs.push(current)
    } else if (current && !current.stop) {
      if (ref.role === "change") current.changes.push(event)
      else current.stop = event
    }
  }
  return runs
}

function inCell(event: LogEvent | null | undefined, cellStartMs: number, cellEndMs: number): boolean {
  return !!event && ms(event.ts) >= cellStartMs && ms(event.ts) < cellEndMs
}

function doseActions(kind: IntraopItemKind, run: Run): IntraopMenuAction[] {
  const actions: IntraopMenuAction[] = []
  const fluidByVolume = kind === "fluid" && run.start.fluidEntryMode !== "RATE" && !run.start.rate
  if (!fluidByVolume) actions.push("change_dose")
  if (kind === "infusion") actions.push("change_syringe")
  if (kind === "agent") actions.push("switch_agent")
  return actions
}

/**
 * The menu of a running item (agent, gas, jet, infusion, fluid) in one cell.
 * Empty when there is nothing to do there.
 */
export function intraopContinuousMenu(
  events: LogEvent[],
  item: { kind: IntraopItemKind; key: string },
  cell: IntraopCell,
  context: IntraopMenuContext,
): IntraopMenuAction[] {
  if (context.readOnly) return []
  const cellStartMs = ms(cell.start)
  const cellEndMs = ms(cell.end)
  const nowMs = ms(context.now)
  const endMs = context.endedAt == null ? null : ms(context.endedAt)
  if (endMs != null && cellStartMs >= endMs) return []
  const runs = runsOf(events, item.kind, item.key)
  // The run this cell belongs to: the last one started before the cell ends.
  const run = [...runs].reverse().find(candidate => ms(candidate.start.ts) < cellEndMs)
  if (!run) return []
  const startMs = ms(run.start.ts)
  const stopMs = run.stop ? ms(run.stop.ts) : null
  const future = cellStartMs > nowMs

  if (future) {
    const planned = [run.start, ...run.changes, run.stop].some(event => event && ms(event.ts) > nowMs && inCell(event, cellStartMs, cellEndMs))
    if (stopMs != null && stopMs < cellStartMs) return planned ? ["remove_planned"] : []
    const actions: IntraopMenuAction[] = []
    if (startMs <= nowMs || startMs < cellStartMs) actions.push("plan_change", "plan_stop")
    if (planned) actions.push("remove_planned")
    return actions
  }

  const stoppedBeforeCell = stopMs != null && stopMs < cellStartMs
  const stopsInCell = inCell(run.stop, cellStartMs, cellEndMs)
  const hereEvents = [run.start, ...run.changes, run.stop].filter(event => inCell(event, cellStartMs, cellEndMs))
  const deleteHere: IntraopMenuAction[] = hereEvents.length > 0 ? ["delete_here"] : []

  if (stoppedBeforeCell || stopsInCell) {
    const actions: IntraopMenuAction[] = []
    if (endMs == null) actions.push("resume")
    actions.push("fix_start", "fix_end", ...deleteHere, "delete_whole")
    return actions
  }
  return ["stop", ...doseActions(item.kind, run), "fix_start", ...deleteHere, "delete_whole"]
}

/** The menu of a one-off entry (drug, vitals, event, complication, lab, position, phase, shock). */
export function intraopPointMenu(event: LogEvent, context: Pick<IntraopMenuContext, "readOnly">): IntraopMenuAction[] {
  if (context.readOnly) return []
  if (event.type === "vital") return ["edit", "delete"]
  if (event.type === "drug") return ["repeat_dose", "edit", "move", "delete"]
  if (event.type === "prompt_answer") return []
  return ["edit", "move", "delete"]
}

/** The item a continuous event belongs to, for opening its menu from the event log. */
export function intraopMenuItemOf(event: LogEvent): { kind: IntraopItemKind; key: string } | null {
  const ref = intraopItemRef(event)
  return ref ? { kind: ref.kind, key: ref.key } : null
}
