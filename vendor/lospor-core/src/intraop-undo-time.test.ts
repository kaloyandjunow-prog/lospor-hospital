import { describe, expect, it } from "vitest"

import { projectIntraopEvents } from "./intraop-engine"
import { applyIntraopEventOps, timetableEditToEventOps } from "./intraop-timetable-edit"
import type { LogEvent, TimetableData } from "./intraop-types"

// An undo puts back the chart as it was; a deleted entry comes back as a new
// event. It used to come back at its column's start (10:03 became 10:00); with
// the entries the editor deleted, it keeps its own minute while it is still in
// the same column (10.0.0).

const start = "2026-09-26T10:00:00.000Z"
const at = (minutes: number) => new Date(Date.parse(start) + minutes * 60_000).toISOString()
const now = at(42)

const log: LogEvent[] = [
  { id: "d1", ts: at(3), type: "drug", name: "Fentanyl", dose: "100", unit: "mcg" },
  { id: "a1", ts: at(7), type: "agent_start", name: "Sevoflurane", value: "2", agentMode: "concurrent" },
]
const project = (events: LogEvent[]) => projectIntraopEvents(events, { start, openThrough: now })

/** Deletes everything, then undoes it: the chart from before is put back. */
function deleteThenUndo(retire: boolean, moveDrugTo?: number) {
  const before = project(log)
  const emptied = JSON.parse(JSON.stringify(before)) as TimetableData
  emptied.drugs = []
  emptied.agents = []
  let n = 0
  const removeOps = timetableEditToEventOps({ log, before, after: emptied, chartStart: start, now, newId: () => `x${++n}` })
  const afterDelete = applyIntraopEventOps(log, removeOps)
  const retired = new Map(log.filter(event => removeOps.remove.includes(event.id)).map(event => [event.id, event]))

  const restored = JSON.parse(JSON.stringify(before)) as TimetableData
  if (moveDrugTo != null) restored.drugs[0].colIdx = moveDrugTo
  const undoOps = timetableEditToEventOps({
    log: afterDelete, before: project(afterDelete), after: restored, chartStart: start, now,
    newId: () => `u${++n}`, ...(retire ? { retired } : {}),
  })
  return applyIntraopEventOps(afterDelete, undoOps)
}

describe("undoing a deletion", () => {
  it("brings each entry back at the minute it had", () => {
    const back = deleteThenUndo(true)
    expect(back.find(event => event.type === "drug")?.ts).toBe(at(3))
    expect(back.find(event => event.type === "agent_start")?.ts).toBe(at(7))
    // As a new entry: the deleted one is not brought back to life.
    expect(back.some(event => event.id === "d1" || event.id === "a1")).toBe(false)
  })

  it("without the deleted entries, falls back to the column's start, as before", () => {
    const back = deleteThenUndo(false)
    expect(back.find(event => event.type === "drug")?.ts).toBe(at(0))
  })

  it("an entry put back in another column takes that column's time", () => {
    const back = deleteThenUndo(true, 2)
    expect(back.find(event => event.type === "drug")?.ts).toBe(at(10))
  })
})
