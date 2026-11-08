import { describe, expect, it } from "vitest"
import { intraopEndCaseStopEvent, intraopRunningItemsAt, validateIntraopTimeline } from "./intraop-commands"
import { projectIntraopEvents, rebuildIntraopActiveState } from "./intraop-engine"
import { describeIntraopEvent, formatJetSettingsLabel } from "./intraop-summary"
import { applyIntraopEventOps, timetableEditToEventOps } from "./intraop-timetable-edit"
import type { LogEvent } from "./intraop-types"

const START = "2026-11-02T10:00:00.000Z"
const at = (minutes: number) => new Date(Date.parse(START) + minutes * 60_000).toISOString()
const context = { start: START, endedAt: at(120) }

const log: LogEvent[] = [
  { id: "j1", ts: at(10), type: "jet_start", jetPressureBar: 2, jetRate: 150, fio2: 100 },
  { id: "j2", ts: at(20), type: "jet_change", jetPressureBar: 2.5 },
  { id: "j3", ts: at(40), type: "jet_stop" },
]

describe("the jet ventilation lane (10.2.0)", () => {
  it("projects a run with its changes, carrying unchanged settings on", () => {
    const [segment] = projectIntraopEvents(log, context).jetSettings ?? []
    expect(segment).toMatchObject({ startCol: 2, endCol: 8, stopped: true, pressureBar: 2, rate: 150, fio2: 100 })
    expect(segment!.settingsChanges).toEqual([{ eventId: "j2", col: 4, pressureBar: 2.5, rate: 150, fio2: 100 }])
  })

  it("leaves the lane out of a chart without jet ventilation", () => {
    expect(projectIntraopEvents([], context).jetSettings).toBeUndefined()
  })

  it("knows what is running", () => {
    expect(rebuildIntraopActiveState(log, at(25)).jet).toEqual({ pressureBar: 2.5, rate: 150, fio2: 100 })
    expect(rebuildIntraopActiveState(log, at(45)).jet).toBeNull()
    expect(intraopRunningItemsAt(log, at(25)).map(item => item.kind)).toEqual(["jet"])
  })

  it("refuses a second start while one runs, and stops it at End case", () => {
    const twice = [log[0]!, { id: "j9", ts: at(15), type: "jet_start", jetPressureBar: 1, jetRate: 15, fio2: 50 } as LogEvent]
    expect(validateIntraopTimeline(twice).map(issue => issue.code)).toContain("ALREADY_RUNNING")
    const [running] = intraopRunningItemsAt([log[0]!], at(30))
    expect(intraopEndCaseStopEvent(running!, at(60))).toMatchObject({ type: "jet_stop", endCaseStop: true })
  })

  it("turns an edit of the drawn lane into events", () => {
    const before = projectIntraopEvents(log, context)
    const after = { ...before, jetSettings: before.jetSettings!.map(segment => ({ ...segment, rate: 300 })) }
    let id = 0
    const ops = timetableEditToEventOps({ before, after, log, chartStart: START, now: at(120), newId: () => `n${++id}` })
    const next = projectIntraopEvents(applyIntraopEventOps(log, ops), context).jetSettings![0]!
    expect(next).toMatchObject({ rate: 300, pressureBar: 2 })
  })

  it("writes the log rows and the settings line with English units", () => {
    expect(formatJetSettingsLabel({ pressureBar: 2, rate: 150, fio2: 100 })).toBe("Jet 2 bar · 150/min · FiO₂ 100%")
    expect(formatJetSettingsLabel({})).toBe("Jet")
    const entries = log.map(event => describeIntraopEvent(event, { language: "bg" }))
    expect(entries.map(entry => entry.sub)).toEqual(["Jet вентилация — начало", "Jet вентилация — промяна", "Jet вентилация"])
    expect(entries[0]!.text).toBe("Jet 2 bar · 150/min · FiO₂ 100%")
    expect(entries[2]!.text).toBe("Jet вентилация — спряна")
  })
})

describe("the jet bar on the running rows (10.2.0)", () => {
  it("draws a running bar in every row from the start to the stop, with the settings in force in each", async () => {
    const { runningItemsByColumn } = await import("./intraop-summary")
    const chart = projectIntraopEvents(log, context)
    const rows = runningItemsByColumn(chart, [1, 2, 3, 4, 5, 8, 9])
    const jets = (col: number) => (rows.get(col) ?? []).filter(item => item.kind === "jet")
    expect(jets(1)).toEqual([])
    expect(jets(2)).toEqual([expect.objectContaining({ kind: "jet", pressureBar: 2, rate: 150, fio2: 100, color: "#14b8a6" })])
    expect(jets(3)).toEqual([expect.objectContaining({ pressureBar: 2 })])
    expect(jets(4)).toEqual([expect.objectContaining({ pressureBar: 2.5, rate: 150 })])
    expect(jets(8)).toHaveLength(1)
    expect(jets(9)).toEqual([])
  })
})
