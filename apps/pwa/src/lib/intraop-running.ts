import type { TciPatient } from "@lospor/core/tci"
import type { TimetableData, VitalsEntry } from "@/components/IntraopTimetable"
import type { LogEvent } from "@/lib/intraop-log-event"
import {
  buildRowSummary as buildCoreRowSummary,
  runningItemsAt as coreRunningItemsAt,
  runningItemsByColumn,
  vitalAbbreviations,
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

/** How a running agent, infusion or fluid is named in its row; the stored name by default. */
export type RunningNameOf = (kind: "agent" | "infusion" | "fluid", name: string) => string
/** Its colour now, if it differs from the one saved (a hospital's drug colours, 10.0.0). */
export type RunningColorOf = (kind: "agent" | "infusion" | "fluid", name: string) => string | undefined

const storedName: RunningNameOf = (_kind, name) => name

function presentRunningItem(item: CoreRunningItem, nameOf: RunningNameOf = storedName, colorOf?: RunningColorOf): RunningItem {
  const presented = presentRunningLabel(item, nameOf)
  const current = item.kind === "gas" ? undefined : colorOf?.(item.kind, item.name)
  if (current) presented.color = current
  if (item.planned) presented.planned = true
  if (item.plannedStop) presented.plannedStop = true
  if (item.plannedChange) presented.plannedChange = true
  if (item.projected) presented.projected = true
  if (item.stopUnconfirmed) presented.stopUnconfirmed = true
  if (item.stopEventId) presented.stopEventId = item.stopEventId
  if (item.eventIds?.length) presented.eventIds = item.eventIds
  return presented
}

function presentRunningLabel(item: CoreRunningItem, nameOf: RunningNameOf): RunningItem {
  if (item.kind === "agent") {
    return { id: item.id, label: nameOf("agent", item.name), color: item.color }
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
      // With its unit: "0.208" alone could be any of mL/kg/hr, mg/hr or mcg/kg/min. A TCI
      // infusion shows its site and target, and the predicted value at this row (≈, 2026-10-18).
      label: item.tci
        ? [nameOf("infusion", item.name), item.tci.site === "PLASMA" ? "Cp" : "Ce", item.rate, item.unit, item.tci.predicted != null ? `≈${item.tci.predicted}` : null].filter(Boolean).join(" ")
        : [nameOf("infusion", item.name), item.rate, item.unit].filter(Boolean).join(" "),
      color: item.color,
    }
  }
  if (item.fluidEntryMode === "RATE") {
    return {
      id: item.id,
      label: `${nameOf("fluid", item.name)} ${item.rate} ${item.unit}`,
      color: item.color,
    }
  }
  return {
    id: item.id,
    label: `${nameOf("fluid", item.name)} ${item.volume}mL`,
    color: item.color,
  }
}

export function runningItemsAt(
  timetable: TimetableData,
  col: number,
): RunningItem[] {
  return coreRunningItemsAt(timetable, col).map(item => presentRunningItem(item))
}

export function runningItemsByCol(
  timetable: TimetableData,
  cols: number[],
  // The live chart of a case not yet ended: running items also show in the
  // rows after now, where a change can be planned on them (Core, 9.13.1).
  options: { projectRunning?: boolean; nameOf?: RunningNameOf; colorOf?: RunningColorOf; tciPatient?: TciPatient | null } = {},
): Map<number, RunningItem[]> {
  const coreRows = runningItemsByColumn(timetable, cols, options)
  return new Map(
    [...coreRows].map(([col, items]) => [
      col,
      items.map(item => presentRunningItem(item, options.nameOf, options.colorOf)),
    ]),
  )
}

export function vitalSummary(vital?: VitalsEntry, language?: string): string {
  return vitalSummaryParts(vital, language).join("  ")
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
  language?: string,
): RowSummary {
  const summary = buildCoreRowSummary(vital, rowEvents, labelOf, language)
  const bpPrefix = `${vitalAbbreviations(language).bp} `
  return {
    criticalParts: summary.criticalParts,
    normalParts: summary.normalParts.map(part =>
      part.startsWith(bpPrefix) ? part.slice(bpPrefix.length) : part,
    ),
    drugParts: summary.eventParts,
    hasCritical: summary.hasCritical,
    hasUnsynced: summary.hasUnsynced,
  }
}
