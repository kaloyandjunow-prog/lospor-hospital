import { describe, expect, it } from "vitest"

import { projectIntraopEvents } from "./intraop-engine"
import { applyIntraopEventOps, timetableEditToEventOps } from "./intraop-timetable-edit"
import type { LogEvent, TimetableData } from "./intraop-types"
import { buildSummaryTimetableModel } from "./summary-timetable"

// A new concentration of a running agent is another agent_start of the same
// agent (the phone's way). The chart keeps each one as a change on the bar
// rather than overwriting the bar's single percent (10.0.0).

const start = "2026-09-26T21:00:00.000Z"
const at = (minutes: number) => new Date(Date.parse(start) + minutes * 60_000).toISOString()
const now = at(62) // column 12

const log: LogEvent[] = [
  { id: "a1", ts: at(0), type: "agent_start", name: "Sevoflurane", value: "2", agentMode: "concurrent" },
  { id: "a2", ts: at(20), type: "agent_start", name: "Sevoflurane", value: "1.5", agentMode: "concurrent" },
  { id: "a3", ts: at(80), type: "agent_start", name: "Sevoflurane", value: "1", agentMode: "concurrent" },
]
const project = (events: LogEvent[]) => projectIntraopEvents(events, { start, openThrough: now })

let n = 0
function edit(change: (chart: TimetableData) => TimetableData) {
  const before = project(log)
  const after = change(JSON.parse(JSON.stringify(before)) as TimetableData)
  const ops = timetableEditToEventOps({ log, before, after, chartStart: start, now, newId: () => `new-${++n}` })
  return { ops, next: applyIntraopEventOps(log, ops) }
}

describe("an agent's concentration over time", () => {
  it("keeps the start's own percent and each later one as a change; one ahead of now is planned, not a second bar", () => {
    const chart = project(log)
    expect(chart.agents).toHaveLength(1)
    expect(chart.agents[0]).toMatchObject({ name: "Sevoflurane", startCol: 0, percent: 2 })
    expect(chart.agents[0].percentChanges).toEqual([
      expect.objectContaining({ eventId: "a2", col: 4, percent: 1.5 }),
      expect.objectContaining({ eventId: "a3", col: 16, percent: 1, planned: true }),
    ])
    expect(chart.agents[0].percentChanges![0].planned).toBeUndefined()
  })

  it("an agent not yet running and started ahead of now is still a planned bar of its own", () => {
    const chart = project([{ id: "d1", ts: at(80), type: "agent_start", name: "Desflurane", value: "6", agentMode: "concurrent" }])
    expect(chart.agents).toEqual([expect.objectContaining({ name: "Desflurane", planned: true, percent: 6 })])
  })

  it("a change added on the chart is one new start of the same agent at that column", () => {
    const { ops, next } = edit(chart => ({
      ...chart,
      agents: chart.agents.map(agent => ({ ...agent, percentChanges: [...agent.percentChanges!, { col: 8, percent: 1.2 }] })),
    }))
    expect(ops.update).toEqual([])
    expect(ops.remove).toEqual([])
    expect(ops.add).toEqual([expect.objectContaining({ type: "agent_start", name: "Sevoflurane", value: "1.2", agentMode: "concurrent", ts: at(40) })])
    expect(project(next).agents[0].percentChanges!.map(change => change.percent)).toEqual([1.5, 1.2, 1])
  })

  it("a change slid to another column re-times only that event; one taken off is deleted", () => {
    const moved = edit(chart => ({
      ...chart,
      agents: chart.agents.map(agent => ({ ...agent, percentChanges: agent.percentChanges!.map(c => c.eventId === "a2" ? { ...c, col: 6 } : c) })),
    }))
    expect(moved.ops.update).toEqual([expect.objectContaining({ id: "a2", ts: at(30), value: "1.5" })])
    expect(moved.ops.add).toEqual([])

    const removed = edit(chart => ({
      ...chart,
      agents: chart.agents.map(agent => ({ ...agent, percentChanges: agent.percentChanges!.filter(c => c.eventId !== "a2") })),
    }))
    expect(removed.ops.remove).toEqual(["a2"])
    expect(removed.ops.update).toEqual([])
  })

  it("correcting the starting percent edits the start only, leaving the changes alone", () => {
    const { ops } = edit(chart => ({ ...chart, agents: chart.agents.map(agent => ({ ...agent, percent: 2.5 })) }))
    expect(ops.update).toEqual([expect.objectContaining({ id: "a1", value: "2.5" })])
    expect(ops.add).toEqual([])
    expect(ops.remove).toEqual([])
  })

  it("deleting the bar deletes its changes with it", () => {
    const { ops } = edit(chart => ({ ...chart, agents: [] }))
    expect(ops.remove.sort()).toEqual(["a1", "a2", "a3"])
  })

  it("prints one stretch per concentration that has happened", () => {
    const model = buildSummaryTimetableModel(project(log))
    expect(model.lanes.find(lane => lane.kind === "agent")!.segments).toEqual([
      expect.objectContaining({ startCol: 0, endCol: 3, text: "Sevoflurane 2%" }),
      expect.objectContaining({ startCol: 4, endCol: 12, text: "1.5%" }),
    ])
  })
})
