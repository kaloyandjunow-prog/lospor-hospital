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
}

function presentRunningItem(item: CoreRunningItem): RunningItem {
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
): Map<number, RunningItem[]> {
  const coreRows = runningItemsByColumn(timetable, cols)
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
