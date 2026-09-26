import type { TimetableData } from "@/types/timetable"

/**
 * Planned entries still after the end when a case is ended (1.4.9). Nothing
 * may remain after the end: End case lists each, and the clinician says it
 * did not happen (deleted) or happened (moved to the end row). The edits are
 * ordinary chart edits, so the form writes them as events.
 */
export type AfterEndItem = {
  key: string
  label: string
  col: number
  color: string
}

export function afterEndItems(data: TimetableData): AfterEndItem[] {
  const items: AfterEndItem[] = []
  data.drugs.forEach((drug, index) => {
    if (drug.planned) items.push({ key: `drug-${index}`, label: `${drug.name} ${drug.dose} ${drug.unit}`.trim(), col: drug.colIdx, color: "#f59e0b" })
  })
  ;(data.clinicalEvents ?? []).forEach((event, index) => {
    if (event.planned) items.push({ key: `event-${index}`, label: event.label, col: event.colIdx, color: event.color })
  })
  for (const [lane, list] of [["infusion", data.infusions], ["fluid", data.fluids], ["agent", data.agents], ["gas", data.gasSettings ?? []]] as const) {
    list.forEach((segment, index) => {
      const name = "name" in segment ? segment.name : "FGF"
      if (segment.planned) items.push({ key: `${lane}-${index}-start`, label: name, col: segment.startCol, color: "#f59e0b" })
      else if (segment.plannedStopCol != null) items.push({ key: `${lane}-${index}-stop`, label: `${name} ■`, col: segment.plannedStopCol, color: "#f59e0b" })
    })
  }
  return items.sort((a, b) => a.col - b.col)
}

/** The chart with one after-end entry resolved: deleted, or moved to `endCol`. */
export function resolveAfterEnd(data: TimetableData, key: string, resolution: "delete" | "move", endCol: number): TimetableData {
  const [lane, rawIndex, part] = key.split("-")
  const index = Number(rawIndex)
  const keep = <T,>(list: T[], at: (item: T) => T | null) => list.flatMap((item, i) => {
    if (i !== index) return [item]
    const next = at(item)
    return next ? [next] : []
  })
  if (lane === "drug") return { ...data, drugs: keep(data.drugs, drug => resolution === "delete" ? null : { ...drug, colIdx: endCol, planned: undefined }) }
  if (lane === "event") return { ...data, clinicalEvents: keep(data.clinicalEvents ?? [], event => resolution === "delete" ? null : { ...event, colIdx: endCol, planned: undefined }) }
  const segment = <S extends { startCol: number; endCol: number; planned?: boolean; plannedStopCol?: number; stopped?: boolean }>(item: S): S | null => {
    if (part === "start") return resolution === "delete" ? null : { ...item, startCol: endCol, endCol, planned: undefined }
    // A planned stop: "did not happen" removes it, "happened" stops the bar at the end.
    return resolution === "delete"
      ? { ...item, plannedStopCol: undefined, stopped: false }
      : { ...item, plannedStopCol: undefined, stopped: true, endCol }
  }
  if (lane === "infusion") return { ...data, infusions: keep(data.infusions, segment) }
  if (lane === "fluid") return { ...data, fluids: keep(data.fluids, segment) }
  if (lane === "agent") return { ...data, agents: keep(data.agents, segment) }
  if (lane === "gas") return { ...data, gasSettings: keep(data.gasSettings ?? [], segment) }
  return data
}
