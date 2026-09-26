import { describe, expect, it } from "vitest"

import {
  intraopAutoEndInstant,
  intraopCanFinalise,
  intraopCascadeDeleteIds,
  intraopEndCaseStopEvent,
  intraopEndCaseStopIds,
  intraopEntriesOutsideCase,
  intraopEventsAfter,
  intraopRunningItemsAt,
  intraopStampForColumn,
  newIntraopTimelineIssues,
  shouldAutoEndIntraopCase,
  validateIntraopTimeline,
} from "./intraop-commands"
import { projectIntraopEvents, rebuildIntraopActiveState } from "./intraop-engine"
import { runningItemsAt, runningItemsByColumn } from "./intraop-summary"
import { calcInfusionTotal, calculateFluidTotals } from "./intraop-totals"
import type { LogEvent } from "./intraop-types"

// Scenario suite for the 1.4.9 time engine: one chart, read the same way by
// the PWA, the web app, print and export.

const start = "2026-09-26T21:00:00.000Z"
const at = (minutes: number, seconds = 0) =>
  new Date(Date.parse(start) + minutes * 60_000 + seconds * 1000).toISOString()
let n = 0
const ev = (minutes: number, patch: Omit<LogEvent, "id" | "ts">, id = `e${++n}`): LogEvent => ({
  id,
  ts: at(minutes),
  ...patch,
})

describe("stamps", () => {
  it("a stop entered in an earlier row records that row, not the tap time (the reported case)", () => {
    // Fluid started 21:00; the clinician taps Stop in the 21:30 row at 22:19:27.
    const ts = intraopStampForColumn({ chartStart: start, column: 6, now: at(79, 27) })
    expect(ts).toBe(at(30))
    const events = [
      ev(0, { type: "fluid_start", fluidId: "f1", name: "Ringer", category: "Crystalloids", fluidEntryMode: "VOLUME", volume: "500" }),
      { id: "stop", ts, type: "fluid_end" as const, fluidId: "f1", volume: "500" },
    ]
    const chart = projectIntraopEvents(events, { start, openThrough: at(79, 27) })
    expect(chart.fluids).toHaveLength(1)
    expect(chart.fluids[0]).toMatchObject({ startCol: 0, endCol: 6 })
  })

  it("an entry in the now row records the exact minute", () => {
    expect(intraopStampForColumn({ chartStart: start, column: 15, now: at(77, 42) })).toBe(at(77))
  })
})

describe("running bars", () => {
  it("end in the now column inclusive and never one beyond it", () => {
    const events = [ev(0, { type: "infusion_start", infId: "i1", name: "Propofol", rate: "6", unit: "mg/kg/hr" })]
    const chart = projectIntraopEvents(events, { start, openThrough: at(32) })
    expect(chart.infusions[0]).toMatchObject({ startCol: 0, endCol: 6 })
  })

  it("are not stretched by a future-dated entry", () => {
    const events = [
      ev(0, { type: "infusion_start", infId: "i1", name: "Propofol", rate: "6", unit: "mg/kg/hr" }),
      ev(120, { type: "drug", name: "Ondansetron", dose: "4", unit: "mg" }),
    ]
    const chart = projectIntraopEvents(events, { start, openThrough: at(32) })
    expect(chart.infusions[0].endCol).toBe(6)
    expect(chart.drugs[0]).toMatchObject({ colIdx: 24, planned: true })
  })

  it("a start and stop in the same minute keep their order", () => {
    const events = [
      { id: "z-start", ts: at(10), type: "infusion_start" as const, infId: "i1", name: "Remifentanil", rate: "0.1", unit: "mcg/kg/min" },
      { id: "a-stop", ts: at(10), type: "infusion_stop" as const, infId: "i1" },
    ]
    expect(validateIntraopTimeline(events)).toEqual([])
    expect(projectIntraopEvents(events, { start, openThrough: at(30) }).infusions[0]).toMatchObject({ startCol: 2, endCol: 2 })
  })
})

describe("planned items", () => {
  const events = [
    ev(0, { type: "infusion_start", infId: "run", name: "Propofol", rate: "6", unit: "mg/hr" }),
    ev(60, { type: "infusion_stop", infId: "run" }),
    ev(45, { type: "infusion_start", infId: "later", name: "Remifentanil", rate: "12", unit: "mcg/hr" }),
    ev(50, { type: "fluid_start", fluidId: "f", name: "Ringer", category: "Crystalloids", fluidEntryMode: "VOLUME", volume: "500" }),
  ]

  it("are drawn as markers and count for nothing before their time", () => {
    const chart = projectIntraopEvents(events, { start, openThrough: at(20) })
    const later = chart.infusions.find(item => item.id === "later")!
    expect(later).toMatchObject({ planned: true, startCol: 9, endCol: 9 })
    expect(calcInfusionTotal(later).amount).toBe(0)
    expect(chart.fluids[0]).toMatchObject({ planned: true, volume: "0" })
    expect(calculateFluidTotals(chart.fluids).crystalloids).toBe(0)
  })

  it("a future stop marks the running bar without ending it", () => {
    const chart = projectIntraopEvents(events, { start, openThrough: at(20) })
    expect(chart.infusions.find(item => item.id === "run")).toMatchObject({ endCol: 4, plannedStopCol: 12 })
  })

  it("count as given once their time passes", () => {
    const chart = projectIntraopEvents(events, { start, openThrough: at(70) })
    const later = chart.infusions.find(item => item.id === "later")!
    expect(later.planned).toBeFalsy()
    expect(later).toMatchObject({ startCol: 9, endCol: 14 })
    expect(chart.infusions.find(item => item.id === "run")).toMatchObject({ endCol: 12 })
    expect(chart.infusions.find(item => item.id === "run")!.plannedStopCol).toBeUndefined()
  })

  it("are not running in the live state before their time", () => {
    expect(rebuildIntraopActiveState(events, at(20)).infusions.map(item => item.infId)).toEqual(["run"])
  })
})

describe("end case", () => {
  const events = [
    ev(0, { type: "infusion_start", infId: "i1", name: "Propofol", rate: "12", unit: "mg/hr" }, "start-i1"),
    ev(0, { type: "fluid_start", fluidId: "f1", name: "Ringer", category: "Crystalloids", fluidEntryMode: "VOLUME", volume: "500" }, "start-f1"),
    ev(90, { type: "drug", name: "Ondansetron", dose: "4", unit: "mg" }, "planned-drug"),
  ]
  const endedAt = at(60)

  it("lists what is running and what lies after the end", () => {
    expect(intraopRunningItemsAt(events, endedAt).map(item => item.key).sort()).toEqual(["f1", "i1"])
    expect(intraopEventsAfter(events, endedAt).map(event => event.id)).toEqual(["planned-drug"])
    expect(intraopCanFinalise(events, endedAt)).toBe(false)
    expect(intraopCanFinalise(events.slice(0, 2), endedAt)).toBe(true)
  })

  it("continued postoperatively: drawn to the end, totals capped at the end", () => {
    const chart = projectIntraopEvents(events.slice(0, 2), { start, endedAt, openThrough: at(600) })
    const infusion = chart.infusions[0]
    expect(infusion.endCol).toBe(12)
    // 13 columns of 12 mg/hr, identical however late the chart is read.
    expect(calcInfusionTotal(infusion).amount).toBe(13)
  })

  it("stopped at the end: marked stops that Resume can remove", () => {
    const stops = intraopRunningItemsAt(events, endedAt)
      .map((item, index) => ({ id: `stop-${index}`, ...intraopEndCaseStopEvent(item, endedAt) }))
    expect(stops).toContainEqual(expect.objectContaining({ type: "infusion_stop", infId: "i1", ts: endedAt, endCaseStop: true }))
    expect(stops).toContainEqual(expect.objectContaining({ type: "fluid_end", fluidId: "f1", ts: endedAt, endCaseStop: true }))
    const all = [...events.slice(0, 2), ...stops]
    expect(validateIntraopTimeline(all)).toEqual([])
    expect(intraopEndCaseStopIds(all)).toEqual(["stop-0", "stop-1"])
  })

  it("the end cannot move before an entry, nor the start after one", () => {
    const stopped = [...events.slice(0, 2), ev(40, { type: "infusion_stop", infId: "i1" }, "stop40")]
    expect(intraopEntriesOutsideCase(stopped, { startedAt: start, endedAt: at(30) }).map(event => event.id)).toEqual(["stop40"])
    expect(intraopEntriesOutsideCase(stopped, { startedAt: at(5), endedAt: at(60) }).map(event => event.id).sort()).toEqual(["start-f1", "start-i1"])
    // Running items (continued postoperatively) never block moving the end.
    expect(intraopEntriesOutsideCase(events.slice(0, 2), { startedAt: start, endedAt: at(10) })).toEqual([])
  })
})

describe("volatile agents", () => {
  it("several run at once when marked concurrent", () => {
    const events = [
      ev(0, { type: "agent_start", name: "Sevoflurane", value: "2", agentMode: "concurrent" }),
      ev(10, { type: "agent_start", name: "Desflurane", value: "6", agentMode: "concurrent" }),
      ev(20, { type: "agent_stop", name: "Sevoflurane", agentMode: "concurrent" }),
    ]
    const chart = projectIntraopEvents(events, { start, openThrough: at(30) })
    expect(chart.agents.map(agent => [agent.name, agent.startCol, agent.endCol])).toEqual([
      ["Sevoflurane", 0, 4],
      ["Desflurane", 2, 6],
    ])
    expect(rebuildIntraopActiveState(events, at(30)).agents.map(agent => agent!.name)).toEqual(["Desflurane"])
    expect(validateIntraopTimeline(events)).toEqual([])
  })

  it("a legacy case keeps its one-agent meaning", () => {
    const events = [
      ev(0, { type: "agent_start", name: "Sevoflurane", value: "2" }),
      ev(10, { type: "agent_start", name: "Desflurane", value: "6" }),
      ev(20, { type: "agent_stop" }),
    ]
    const chart = projectIntraopEvents(events, { start, openThrough: at(30) })
    expect(chart.agents.map(agent => [agent.name, agent.startCol, agent.endCol])).toEqual([
      ["Sevoflurane", 0, 2],
      ["Desflurane", 2, 4],
    ])
    expect(validateIntraopTimeline(events)).toEqual([])
  })
})

describe("refusals", () => {
  const base = [ev(10, { type: "infusion_start", infId: "i1", name: "Propofol", rate: "6", unit: "mg/hr" }, "start")]

  it("a stop before its start", () => {
    const issues = newIntraopTimelineIssues(base, [...base, ev(5, { type: "infusion_stop", infId: "i1" }, "stop")])
    expect(issues).toEqual([{ code: "STOP_BEFORE_START", eventId: "stop" }])
  })

  it("a change or stop of something not running", () => {
    const issues = newIntraopTimelineIssues(base, [...base, ev(5, { type: "infusion_rate", infId: "nope", rate: "3" }, "rate")])
    expect(issues).toEqual([{ code: "NOT_RUNNING", eventId: "rate" }])
  })

  it("a stop moved before a later change of the same item", () => {
    const withChange = [...base, ev(30, { type: "infusion_rate", infId: "i1", rate: "3" }, "rate")]
    const issues = newIntraopTimelineIssues(withChange, [...withChange, ev(20, { type: "infusion_stop", infId: "i1" }, "stop")])
    expect(issues).toEqual([{ code: "STOP_BEFORE_LATER_CHANGE", eventId: "stop", relatedEventId: "rate" }])
  })

  it("allows a restart", () => {
    const events = [
      ...base,
      ev(20, { type: "infusion_stop", infId: "i1" }),
      ev(30, { type: "infusion_start", infId: "i1", name: "Propofol", rate: "4", unit: "mg/hr" }),
    ]
    expect(validateIntraopTimeline(events)).toEqual([])
    expect(projectIntraopEvents(events, { start, openThrough: at(40) }).infusions.map(item => [item.startCol, item.endCol]))
      .toEqual([[2, 4], [6, 8]])
  })

  it("a vital in the future, while other future entries are allowed", () => {
    const events = [
      ...base,
      ev(90, { type: "vital", heartRate: 70 }, "future-vital"),
      ev(90, { type: "drug", name: "Ondansetron", dose: "4", unit: "mg" }),
    ]
    expect(validateIntraopTimeline(events, { now: at(20) })).toEqual([{ code: "FUTURE_VITAL", eventId: "future-vital" }])
  })

  it("never blocks an edit because the old record already broke a rule", () => {
    const legacy = [...base, ev(5, { type: "infusion_stop", infId: "i1" }, "old-stop")]
    const edited = [...legacy, ev(40, { type: "drug", name: "Fentanyl", dose: "50", unit: "mcg" })]
    expect(validateIntraopTimeline(edited)).toHaveLength(1)
    expect(newIntraopTimelineIssues(legacy, edited)).toEqual([])
  })
})

describe("delete", () => {
  it("a start takes its changes and stop, and leaves a restart alone", () => {
    const events = [
      ev(0, { type: "infusion_start", infId: "i1", name: "Propofol", rate: "6", unit: "mg/hr" }, "s1"),
      ev(10, { type: "infusion_rate", infId: "i1", rate: "3" }, "r1"),
      ev(20, { type: "infusion_stop", infId: "i1" }, "x1"),
      ev(30, { type: "infusion_start", infId: "i1", name: "Propofol", rate: "4", unit: "mg/hr" }, "s2"),
      ev(35, { type: "drug", name: "Fentanyl", dose: "50", unit: "mcg" }, "d1"),
    ]
    expect(intraopCascadeDeleteIds(events, "s1")).toEqual(["s1", "r1", "x1"])
    expect(intraopCascadeDeleteIds(events, "r1")).toEqual(["r1"])
    expect(intraopCascadeDeleteIds(events, "s2")).toEqual(["s2"])
  })
})

describe("clock", () => {
  it("crosses midnight on exact instants", () => {
    const chartStart = "2026-09-26T23:50:00.000Z"
    const events = [{ id: "a", ts: "2026-09-27T00:10:00.000Z", type: "drug" as const, name: "X", dose: "1", unit: "mg" }]
    expect(projectIntraopEvents(events, { start: chartStart }).drugs[0].colIdx).toBe(4)
  })

  it("keeps five-minute columns through a daylight-saving change", () => {
    // Europe/Sofia leaves summer time at 01:00 UTC on 25 October 2026.
    const chartStart = "2026-10-25T00:30:00.000Z"
    const events = [{ id: "a", ts: "2026-10-25T01:30:00.000Z", type: "drug" as const, name: "X", dose: "1", unit: "mg" }]
    expect(projectIntraopEvents(events, { start: chartStart }).drugs[0].colIdx).toBe(12)
    expect(intraopStampForColumn({ chartStart, column: 12, now: "2026-10-25T03:00:00.000Z" })).toBe("2026-10-25T01:30:00.000Z")
  })
})

describe("48-hour automatic end", () => {
  const startedAt = "2026-09-20T08:00:00.000Z"
  const now = "2026-09-22T08:30:00.000Z"

  it("ends only a started, unended case after 48 hours with no screen open", () => {
    expect(shouldAutoEndIntraopCase({ startedAt, endedAt: null, now })).toBe(true)
    expect(shouldAutoEndIntraopCase({ startedAt, endedAt: null, now: "2026-09-22T07:59:00.000Z" })).toBe(false)
    expect(shouldAutoEndIntraopCase({ startedAt, endedAt: now, now })).toBe(false)
    expect(shouldAutoEndIntraopCase({ startedAt: null, endedAt: null, now })).toBe(false)
    expect(shouldAutoEndIntraopCase({ startedAt, endedAt: null, now, screenOpenUntil: "2026-09-22T08:30:10.000Z" })).toBe(false)
    expect(shouldAutoEndIntraopCase({ startedAt, endedAt: null, now, screenOpenUntil: "2026-09-22T08:20:00.000Z" })).toBe(true)
  })

  it("never ends a case that is being charted, however old its start (retrospective entry)", () => {
    expect(shouldAutoEndIntraopCase({ startedAt, endedAt: null, now, lastSavedAt: "2026-09-22T08:00:00.000Z" })).toBe(false)
    expect(shouldAutoEndIntraopCase({ startedAt, endedAt: null, now, lastSavedAt: "2026-09-20T08:10:00.000Z" })).toBe(true)
  })

  it("records the last recorded entry as the end, ignoring planned ones", () => {
    const events = [
      { id: "a", ts: "2026-09-20T10:15:00.000Z", type: "drug" as const, name: "X" },
      { id: "b", ts: "2026-09-23T10:00:00.000Z", type: "drug" as const, name: "Planned" },
    ]
    expect(intraopAutoEndInstant(events, startedAt, now).toISOString()).toBe("2026-09-20T10:15:00.000Z")
    expect(intraopAutoEndInstant([], startedAt, now).toISOString()).toBe(startedAt)
  })
})

describe("row summary marks", () => {
  it("shows a planned start once, as planned, and a planned stop past the bar", () => {
    const events = [
      ev(0, { type: "infusion_start", infId: "run", name: "Propofol", rate: "6", unit: "mg/hr" }),
      ev(60, { type: "infusion_stop", infId: "run" }),
      ev(45, { type: "agent_start", name: "Sevoflurane", value: "2", agentMode: "concurrent" }),
    ]
    const chart = projectIntraopEvents(events, { start, openThrough: at(20) })
    const rows = runningItemsByColumn(chart, [4, 5, 9, 12])
    expect(rows.get(4)!.map(item => [item.id, item.planned, item.plannedStop])).toEqual([["inf-run", undefined, undefined]])
    expect(rows.get(5)).toEqual([])
    expect(rows.get(9)!.map(item => [item.id, item.planned])).toEqual([["agent-Sevoflurane", true]])
    expect(rows.get(12)!.map(item => [item.id, item.plannedStop])).toEqual([["inf-run", true]])
    expect(runningItemsAt(chart, 12)).toEqual(rows.get(12))
  })
})
