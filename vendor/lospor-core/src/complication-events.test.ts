import { describe, expect, it } from "vitest"

import {
  intraopComplicationList,
  timelineComplicationEvent,
  withLegacyComplicationNotes,
  withoutLegacyComplication,
} from "./complication-events"
import { projectIntraopEvents } from "./intraop-engine"
import { isIntraopEndCorrection, isIntraopEndCorrectionReason } from "./intraop-end-correction"
import { describeIntraopEvent, isChartedIntraopEvent } from "./intraop-summary"
import { timetableEditToEventOps } from "./intraop-timetable-edit"
import { parseLogEvent, type LogEvent } from "./intraop-types"

const start = "2026-11-01T09:00:00.000Z"
const episode: LogEvent = {
  id: "c1", type: "complication", ts: "2026-11-01T09:10:00.000Z", endTs: "2026-11-01T09:25:00.000Z",
  label: "Hypotension", color: "#ef4444", complicationSource: "vitals",
}

describe("a timed complication", () => {
  it("survives the shared parser", () => {
    expect(parseLogEvent(JSON.parse(JSON.stringify(episode)))).toEqual(episode)
  })

  it("is one marker on the chart, spanning its episode", () => {
    const chart = projectIntraopEvents([episode], { start, openThrough: "2026-11-01T10:00:00.000Z" })
    expect(chart.clinicalEvents).toEqual([expect.objectContaining({ eventId: "c1", colIdx: 2, endColIdx: 5, kind: "complication", label: "Hypotension" })])
  })

  it("moves with its event when the chart marker is moved, and deletes with it", () => {
    const before = projectIntraopEvents([episode], { start, openThrough: "2026-11-01T10:00:00.000Z" })
    const moved = { ...before, clinicalEvents: [{ ...before.clinicalEvents![0], colIdx: 3 }] }
    const ops = timetableEditToEventOps({ log: [episode], before, after: moved, chartStart: start, now: "2026-11-01T10:00:00.000Z", newId: () => "x" })
    expect(ops.update).toEqual([expect.objectContaining({ id: "c1", type: "complication", ts: "2026-11-01T09:15:00.000Z" })])
    const removed = timetableEditToEventOps({ log: [episode], before, after: { ...before, clinicalEvents: [] }, chartStart: start, now: "2026-11-01T10:00:00.000Z", newId: () => "x" })
    expect(removed.remove).toEqual(["c1"])
  })

  it("reads in the event log, Bulgarian names from the catalogue", () => {
    expect(describeIntraopEvent(episode, { language: "en" })).toMatchObject({ text: "Hypotension", sub: "Complication · episode" })
    expect(describeIntraopEvent(episode, { language: "bg" }).text).toBe("Хипотенсия")
  })

  it("from the timeline is a moment", () => {
    expect(timelineComplicationEvent({ id: "t1", ts: start, label: "Laryngospasm" })).toEqual({
      id: "t1", ts: start, type: "complication", label: "Laryngospasm", color: "#ef4444", complicationSource: "timeline",
    })
  })
})

describe("the complications list", () => {
  it("shows timed entries first, then the old text's items without a time", () => {
    const list = intraopComplicationList([episode], "Bronchospasm; Aspiration — treated with salbutamol")
    expect(list.map(item => [item.source, item.label])).toEqual([
      ["event", "Hypotension"], ["legacy", "Bronchospasm"], ["legacy", "Aspiration"],
    ])
    expect(list[0]).toMatchObject({ eventId: "c1", fromVitals: true, endTs: episode.endTs })
  })

  it("deletes an old item and keeps the notes", () => {
    expect(withoutLegacyComplication("Bronchospasm; Aspiration — treated", "Aspiration")).toBe("Bronchospasm — treated")
    expect(withoutLegacyComplication("Bronchospasm", "Bronchospasm")).toBeNull()
    expect(withLegacyComplicationNotes("Bronchospasm", "settled")).toBe("Bronchospasm — settled")
  })
})

describe("a Not now", () => {
  it("is never shown as something that happened", () => {
    expect(isChartedIntraopEvent({ type: "prompt_answer" })).toBe(false)
    expect(isChartedIntraopEvent({ type: "complication" })).toBe(true)
    const chart = projectIntraopEvents([{ id: "p", type: "prompt_answer", ts: start, answerFor: "r", answerKind: "hypotension", answer: "not_now" }], { start, openThrough: start })
    expect(chart.clinicalEvents).toEqual([])
  })
})

describe("correcting an end", () => {
  it("is a change from one end to another, not ending or resuming", () => {
    expect(isIntraopEndCorrection("2026-11-01T10:00:00Z", "2026-11-01T09:50:00Z")).toBe(true)
    expect(isIntraopEndCorrection(null, "2026-11-01T09:50:00Z")).toBe(false)
    expect(isIntraopEndCorrection("2026-11-01T10:00:00Z", null)).toBe(false)
    expect(isIntraopEndCorrection("2026-11-01T10:00:00Z", "2026-11-01T10:00:00.000Z")).toBe(false)
    expect(isIntraopEndCorrectionReason("WRONG_TIME_ENTERED")).toBe(true)
    expect(isIntraopEndCorrectionReason("because")).toBe(false)
  })
})

describe("drawn on the web chart", () => {
  it("a new complication or shock marker is saved as its own event type", () => {
    const before = projectIntraopEvents([], { start, openThrough: "2026-11-01T10:00:00.000Z" })
    const after = { ...before, clinicalEvents: [
      { colIdx: 2, label: "Laryngospasm", color: "#ef4444", kind: "complication" as const },
      { colIdx: 3, label: "Cardioversion", color: "#f59e0b", kind: "defibrillation" as const, energyJ: 120, synchronized: true },
      { colIdx: 4, label: "Incision", color: "#ef4444" },
    ] }
    let n = 0
    const ops = timetableEditToEventOps({ log: [], before, after, chartStart: start, now: "2026-11-01T10:00:00.000Z", newId: () => `n${n++}` })
    expect(ops.add.map(event => [event.type, event.label])).toEqual([
      ["complication", "Laryngospasm"], ["defibrillation", "Cardioversion"], ["clinical_event", "Incision"],
    ])
    expect(ops.add[0]).toMatchObject({ complicationSource: "timeline", ts: "2026-11-01T09:10:00.000Z" })
    expect(ops.add[1]).toMatchObject({ energyJ: 120, synchronized: true })
  })
})

describe("the old line of text from either app", () => {
  it("reads the web's form, known items beside free text", () => {
    const list = intraopComplicationList([], "Bronchospasm; settled with salbutamol; Aspiration")
    expect(list.map(item => item.label)).toEqual(["Bronchospasm", "Aspiration"])
  })
})
