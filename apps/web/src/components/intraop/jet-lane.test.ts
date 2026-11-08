import { describe, expect, it } from "vitest"
import { applyIntraopEventOps, timetableEditToEventOps } from "@lospor/core/intraop-timetable-edit"
import { projectIntraopEvents } from "@lospor/core/intraop-engine"
import type { TimetableData } from "@lospor/core/intraop-types"
import { changeJet, jetSegmentAt, jetSettingsAtColumn, startJet, stopJet } from "./jet-lane"

const empty: TimetableData = { vitals: [], drugs: [], fluids: [], agents: [], infusions: [] }

describe("the jet ventilation lane", () => {
  it("starts, changes and stops a run, each change from its own column", () => {
    let chart = startJet(empty, 2, { pressureBar: 2, rate: 150, fio2: 100 }, "jet")
    chart = changeJet(chart, "jet", 4, { pressureBar: 2.5, rate: 300, fio2: 60 })
    chart = stopJet(chart, "jet", 6)
    const seg = chart.jetSettings![0]!
    expect(seg).toMatchObject({ startCol: 2, endCol: 6, stopped: true })
    expect(jetSettingsAtColumn(seg, 3)).toMatchObject({ rate: 150, changeCol: 2 })
    expect(jetSettingsAtColumn(seg, 5)).toMatchObject({ pressureBar: 2.5, rate: 300, fio2: 60, changeCol: 4 })
    expect(jetSegmentAt(chart, 5)?.id).toBe("jet")
    expect(jetSegmentAt(chart, 7)).toBeNull()
  })

  it("a change at the start column replaces the start's settings", () => {
    const chart = changeJet(startJet(empty, 2, { pressureBar: 2, rate: 150, fio2: 100 }, "jet"), "jet", 2, { pressureBar: 1.5, rate: 100, fio2: 80 })
    expect(chart.jetSettings![0]).toMatchObject({ pressureBar: 1.5, rate: 100, fio2: 80 })
    expect(chart.jetSettings![0]!.settingsChanges).toBeUndefined()
  })

  it("writes Core's jet events through the chart edit", () => {
    const start = "2026-11-02T10:00:00.000Z"
    const now = "2026-11-02T10:42:00.000Z"
    const before = projectIntraopEvents([], { start, openThrough: now })
    let n = 0
    const after = stopJet(changeJet(startJet(before, 2, { pressureBar: 2, rate: 150, fio2: 100 }, "jet"), "jet", 4, { pressureBar: 2, rate: 300, fio2: 100 }), "jet", 6)
    const ops = timetableEditToEventOps({ log: [], before, after, chartStart: start, now, newId: () => `e${++n}` })
    expect(ops.add.map(event => event.type)).toEqual(["jet_start", "jet_change", "jet_stop"])
    expect(ops.add[0]).toMatchObject({ jetPressureBar: 2, jetRate: 150, fio2: 100 })
    const chart = projectIntraopEvents(applyIntraopEventOps([], ops), { start, openThrough: now })
    expect(chart.jetSettings?.[0]).toMatchObject({ startCol: 2, endCol: 6, stopped: true, rate: 150 })
  })
})
