import type { TimetableData, VitalsEntry } from "@/components/IntraopTimetable"
import type { LogEvent } from "@/lib/intraop-log-event"
import {
  buildRowSummary as buildCoreRowSummary,
  runningItemsAt as coreRunningItemsAt,
  runningItemsByColumn,
  vitalSummaryParts,
  type RunningItem as CoreRunningItem,
} from "@lospor/core/intraop-summary"

export type RunningItem = {
  id: string
  label: string
  color: string
  /** A future-dated start: a marker in its own row, not given yet. */
  planned?: boolean
  /** The row a future-dated stop falls in, past the running bar. */
  plannedStop?: boolean
  /** A rate or setting change dated after now, shown with its new value (9.13.0). */
  plannedChange?: boolean
  /** Running now and still running in this row after now: drawn dashed, and a control (9.13.1). */
  projected?: boolean
  /** The row a stop entered ahead reached, not yet confirmed; the stop to answer about. */
  stopUnconfirmed?: boolean
  stopEventId?: string
  /** The events the item came from, for its save state. */
  eventIds?: string[]
}

function presentRunningItem(item: CoreRunningItem): RunningItem {
  const presented = presentRunningLabel(item)
  if (item.planned) presented.planned = true
  if (item.plannedStop) presented.plannedStop = true
  if (item.plannedChange) presented.plannedChange = true
  if (item.projected) presented.projected = true
  if (item.stopUnconfirmed) presented.stopUnconfirmed = true
  if (item.stopEventId) presented.stopEventId = item.stopEventId
  if (item.eventIds?.length) presented.eventIds = item.eventIds
  return presented
}

function presentRunningLabel(item: CoreRunningItem): RunningItem {
  if (item.kind === "agent") {
    return { id: item.id, label: item.name, color: item.color }
  }
  if (item.kind === "gas") {
    return {
      id: item.id,
      label: `FGF ${item.fgf}L/min \u00b7 FiO2 ${item.fio2}%`,
      color: item.color,
    }
  }
  if (item.kind === "infusion") {
    return {
      id: item.id,
      label: `${item.name} ${item.rate}`,
      color: item.color,
    }
  }
  if (item.fluidEntryMode === "RATE") {
    return {
      id: item.id,
      label: `${item.name} ${item.rate} ${item.unit}`,
      color: item.color,
    }
  }
  return {
    id: item.id,
    label: `${item.name} ${item.volume}mL`,
    color: item.color,
  }
}

export function runningItemsAt(
  timetable: TimetableData,
  col: number,
): RunningItem[] {
  return coreRunningItemsAt(timetable, col).map(presentRunningItem)
}

export function runningItemsByCol(
  timetable: TimetableData,
  cols: number[],
  // The live chart of a case not yet ended: running items also show in the
  // rows after now, where a change can be planned on them (Core, 9.13.1).
  options: { projectRunning?: boolean } = {},
): Map<number, RunningItem[]> {
  const coreRows = runningItemsByColumn(timetable, cols, options)
  return new Map(
    [...coreRows].map(([col, items]) => [
      col,
      items.map(presentRunningItem),
    ]),
  )
}

export function vitalSummary(vital?: VitalsEntry): string {
  return vitalSummaryParts(vital).join("  ")
}

export type RowSummary = {
  criticalParts: string[]
  normalParts: string[]
  drugParts: string[]
  hasCritical: boolean
  hasUnsynced: boolean
}

export function buildRowSummary(
  vital: VitalsEntry | undefined,
  rowEvents: LogEvent[],
  labelOf: (event: LogEvent) => string,
): RowSummary {
  const summary = buildCoreRowSummary(vital, rowEvents, labelOf)
  return {
    criticalParts: summary.criticalParts,
    normalParts: summary.normalParts.map(part =>
      part.startsWith("BP ") ? part.slice(3) : part,
    ),
    drugParts: summary.eventParts,
    hasCritical: summary.hasCritical,
    hasUnsynced: summary.hasUnsynced,
  }
}
