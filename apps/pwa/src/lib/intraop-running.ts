import { intraopRunTotalLabel, type RunTotalContext } from "@lospor/core/intraop-run-totals"
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
  /** 10.8.0: a row after now on the way to a planned stop: the side strip is dashed. */
  towardsPlannedStop?: boolean
  /** The row a stop entered ahead reached, not yet confirmed; the stop to answer about. */
  stopUnconfirmed?: boolean
  stopEventId?: string
  /** The events the item came from, for its save state. */
  eventIds?: string[]
  /** 10.8.0: the column it started in, for how long it has run (the web chart's total). */
  startCol?: number
  /** 10.8.0: what it has come to -- amount, volume with time and rate, or how long (Core, the same words as the web lane's total). */
  total?: string
}

/** How a running agent, infusion or fluid is named in its row; the stored name by default. */
export type RunningNameOf = (kind: "agent" | "infusion" | "fluid", name: string) => string
/** Its colour now, if it differs from the one saved (a hospital's drug colours, 10.0.0). */
export type RunningColorOf = (kind: "agent" | "infusion" | "fluid", name: string) => string | undefined
/** A second infusion of one group in a row is told apart by a shade of its colour (Core, PRAVILA 13). */
export type SameGroupShade = { groupOf: (infusionName: string) => string | undefined; shade: (hex: string, index: number) => string }

const storedName: RunningNameOf = (_kind, name) => name

function presentRunningItem(item: CoreRunningItem, nameOf: RunningNameOf = storedName, colorOf?: RunningColorOf): RunningItem {
  const presented = presentRunningLabel(item, nameOf)
  const current = item.kind === "gas" || item.kind === "jet" ? undefined : colorOf?.(item.kind, item.name)
  if (current) presented.color = current
  if (item.planned) presented.planned = true
  if (item.plannedStop) presented.plannedStop = true
  if (item.plannedChange) presented.plannedChange = true
  if (item.projected) presented.projected = true
  if (item.towardsPlannedStop) presented.towardsPlannedStop = true
  if (item.stopUnconfirmed) presented.stopUnconfirmed = true
  if (item.stopEventId) presented.stopEventId = item.stopEventId
  if (item.eventIds?.length) presented.eventIds = item.eventIds
  if (item.startCol != null) presented.startCol = item.startCol
  return presented
}

function presentRunningLabel(item: CoreRunningItem, nameOf: RunningNameOf): RunningItem {
  if (item.kind === "agent") {
    // 10.8.0: with the dose in force in this row (it had none, so "Dose" could not be read off the row).
    return { id: item.id, label: [nameOf("agent", item.name), item.percent != null ? `${item.percent}%` : null].filter(Boolean).join(" "), color: item.color }
  }
  if (item.kind === "jet") {
    // Pressure, rate and FiO2 in force in this row (10.2.0).
    return { id: item.id, label: `Jet ${item.pressureBar} bar \u00b7 ${item.rate}/min \u00b7 FiO2 ${item.fio2}%`, color: item.color }
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
  options: { projectRunning?: boolean; nameOf?: RunningNameOf; colorOf?: RunningColorOf; sameGroup?: SameGroupShade; tciPatient?: TciPatient | null; totals?: Omit<RunTotalContext, "tciPatient"> } = {},
): Map<number, RunningItem[]> {
  const coreRows = runningItemsByColumn(timetable, cols, options)
  return new Map(
    [...coreRows].map(([col, items]) => [
      col,
      items.map(item => {
        const presented = presentRunningItem(item, options.nameOf, options.colorOf)
        if (item.kind === "infusion" && options.sameGroup) {
          const group = options.sameGroup.groupOf(item.name) ?? item.name
          const before = items.slice(0, items.indexOf(item)).filter(other => other.kind === "infusion" && (options.sameGroup!.groupOf(other.name) ?? other.name) === group).length
          if (before > 0) presented.color = options.sameGroup.shade(presented.color, before)
        }
        const total = options.totals && !item.planned && !item.plannedStop && !item.plannedChange
          ? intraopRunTotalLabel(timetable, presented.id, col, { ...options.totals, tciPatient: options.tciPatient ?? null }) : null
        return total ? { ...presented, total } : presented
      }),
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

const SUMMARY_EVENT_TYPES: ReadonlySet<string> = new Set(["drug", "clinical_event", "complication", "defibrillation"])

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
    // Core's line names the first four drugs and events; a complication or a shock in the same five minutes is as
    // much part of it, so they are named too (and nothing is hidden behind a fifth).
    drugParts: rowEvents.filter(event => SUMMARY_EVENT_TYPES.has(event.type)).slice(0, 6).map(labelOf),
    hasCritical: summary.hasCritical,
    hasUnsynced: summary.hasUnsynced,
  }
}
