import { describe, expect, it } from "vitest"
import {
  intraopAsksStillRunning,
  intraopDeleteAsksAboutPair,
  intraopDeleteHere,
  intraopDeleteWhole,
  intraopEndCaseQuestions,
  intraopFixBoundary,
  intraopLinkedSection,
  intraopMoveEvent,
  intraopOpenTourniquets,
  intraopOpsBetween,
  intraopResolveStartedAtAll,
  intraopRunEventIds,
  intraopStoppedItemsAt,
  intraopTourniquetPartnerId,
} from "./intraop-edits"
import { intraopEndCaseStopEvent } from "./intraop-commands"
import { parseLogEvent, type LogEvent } from "./intraop-types"

const T0 = Date.parse("2026-11-21T08:00:00.000Z")
const at = (min: number) => new Date(T0 + min * 60_000).toISOString()
const now = at(60)
const ctx = { now, startedAt: at(0) }

const propofol: LogEvent[] = [
  { id: "p1", ts: at(10), type: "infusion_start", infId: "prop", name: "Propofol", rate: "5", unit: "mg/kg/h" },
  { id: "p2", ts: at(25), type: "infusion_rate", infId: "prop", rate: "8", unit: "mg/kg/h" },
  { id: "p3", ts: at(40), type: "infusion_stop", infId: "prop" },
]
const fentanyl: LogEvent = { id: "d1", ts: at(15), type: "drug", name: "Fentanyl", dose: "100", unit: "mcg" }
const tqOn: LogEvent = { id: "t1", ts: at(5), type: "clinical_event", label: "Tourniquet on" }
const tqOff: LogEvent = { id: "t2", ts: at(50), type: "clinical_event", label: "Tourniquet off" }

describe("Move", () => {
  it("moves a one-off entry and keeps its id", () => {
    const result = intraopMoveEvent([fentanyl], "d1", at(10), ctx)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.events[0].id).toBe("d1")
      expect(result.events[0].ts).toBe(at(10))
      expect(result.events[0].recordedAt).toBe(now)
    }
  })

  it("never moves something that happened into the future", () => {
    expect(intraopMoveEvent([fentanyl], "d1", at(70), ctx)).toEqual({ ok: false, refusal: "DONE_INTO_FUTURE" })
  })

  it("refuses a move outside the case", () => {
    expect(intraopMoveEvent([fentanyl], "d1", at(-5), ctx)).toEqual({ ok: false, refusal: "BEFORE_CASE_START" })
    expect(intraopMoveEvent([fentanyl], "d1", at(55), { ...ctx, endedAt: at(50) })).toEqual({ ok: false, refusal: "AFTER_CASE_END" })
  })

  it("does not move vitals or running items", () => {
    const vital: LogEvent = { id: "v1", ts: at(5), type: "vital", heartRate: 70 }
    expect(intraopMoveEvent([vital], "v1", at(10), ctx)).toEqual({ ok: false, refusal: "NOT_MOVABLE" })
    expect(intraopMoveEvent(propofol, "p1", at(5), ctx)).toEqual({ ok: false, refusal: "NOT_MOVABLE" })
  })

  it("keeps a tourniquet off after its on", () => {
    expect(intraopMoveEvent([tqOn, tqOff], "t2", at(3), ctx)).toEqual({ ok: false, refusal: "PAIR_ORDER" })
    expect(intraopMoveEvent([tqOn, tqOff], "t2", at(45), ctx).ok).toBe(true)
  })
})

describe("Fix start / Fix end", () => {
  it("moves the start from any cell of the run", () => {
    const result = intraopFixBoundary(propofol, "p2", "start", at(5), ctx)
    expect(result.ok && result.events.find(event => event.id === "p1")?.ts).toBe(at(5))
  })

  it("moves a recorded stop, and refuses one that is not there", () => {
    const fixed = intraopFixBoundary(propofol, "p1", "end", at(45), ctx)
    expect(fixed.ok && fixed.events.find(event => event.id === "p3")?.ts).toBe(at(45))
    expect(intraopFixBoundary(propofol.slice(0, 2), "p1", "end", at(45), ctx)).toEqual({ ok: false, refusal: "NO_END" })
  })

  it("refuses a stop before a later change, and a running start after now", () => {
    expect(intraopFixBoundary(propofol, "p1", "end", at(20), ctx)).toMatchObject({ ok: false, refusal: "TIMELINE" })
    expect(intraopFixBoundary(propofol.slice(0, 2), "p1", "start", at(65), ctx)).toEqual({ ok: false, refusal: "START_AFTER_NOW" })
  })
})

describe("Delete", () => {
  it("removes what is in the cell: a start takes its run, a change or a stop goes alone", () => {
    expect(intraopDeleteHere(propofol, "p1")).toEqual([])
    expect(intraopDeleteHere(propofol, "p2").map(event => event.id)).toEqual(["p1", "p3"])
    expect(intraopDeleteHere(propofol, "p3").map(event => event.id)).toEqual(["p1", "p2"])
  })

  it("removes the whole run from any of its cells", () => {
    expect(intraopRunEventIds(propofol, "p3")).toEqual(["p1", "p2", "p3"])
    expect(intraopDeleteWhole([...propofol, fentanyl], "p2")).toEqual([fentanyl])
  })

  it("asks about the pair only when a tourniquet on has its off", () => {
    expect(intraopDeleteAsksAboutPair([tqOn, tqOff], "t1")).toBe(true)
    expect(intraopDeleteAsksAboutPair([tqOn, tqOff], "t2")).toBe(false)
    expect(intraopDeleteAsksAboutPair([tqOn], "t1")).toBe(false)
    expect(intraopTourniquetPartnerId([tqOn, tqOff], "t2")).toBe("t1")
    expect(intraopDeleteHere([tqOn, tqOff], "t1", { withPair: true })).toEqual([])
  })
})

describe("questions", () => {
  it("asks whether a start charted in an earlier cell is still running", () => {
    expect(intraopAsksStillRunning(propofol[0], now, at(0))).toBe(true)
    expect(intraopAsksStillRunning({ ...propofol[0], ts: at(61) }, at(62), at(0))).toBe(false)
    expect(intraopAsksStillRunning(fentanyl, now, at(0))).toBe(false)
  })

  it("lists the stopped items for a later cell", () => {
    expect(intraopStoppedItemsAt(propofol, at(45)).map(item => item.stopEvent.id)).toEqual(["p3"])
    expect(intraopStoppedItemsAt(propofol, at(30))).toEqual([])
  })

  it("asks at End case: started at all, continues after end, tourniquet still on, happened", () => {
    const events: LogEvent[] = [
      { id: "r1", ts: at(10), type: "infusion_start", infId: "remi", name: "Remifentanil", rate: "0.1", unit: "mcg/kg/min" },
      { id: "x1", ts: at(70), type: "infusion_start", infId: "nor", name: "Noradrenaline", rate: "0.05", unit: "mcg/kg/min" },
      { id: "x2", ts: at(80), type: "infusion_stop", infId: "nor" },
      { id: "d9", ts: at(75), type: "drug", name: "Ondansetron", dose: "4", unit: "mg" },
      tqOn,
    ]
    const questions = intraopEndCaseQuestions(events, at(60))
    expect(questions.map(question => question.kind).sort()).toEqual(["continues_after_end", "happened", "started_at_all", "tourniquet_open"])
    expect(intraopOpenTourniquets(events, at(60)).map(event => event.id)).toEqual(["t1"])
  })

  it("resolves a start planned after the end", () => {
    const events: LogEvent[] = [
      { id: "x1", ts: at(70), type: "infusion_start", infId: "nor", name: "Noradrenaline", rate: "0.05", unit: "mcg/kg/min" },
      { id: "x2", ts: at(80), type: "infusion_stop", infId: "nor" },
    ]
    const none = intraopResolveStartedAtAll(events, "x1", null, { ...ctx, endedAt: at(60) })
    expect(none.ok && none.events).toEqual([])
    const yes = intraopResolveStartedAtAll(events, "x1", at(50), { ...ctx, endedAt: at(60) })
    expect(yes.ok && yes.events.map(event => [event.id, event.ts])).toEqual([["x1", at(50)]])
  })
})

describe("continues after the end", () => {
  it("is written on the End case stop and survives parsing", () => {
    const stop = intraopEndCaseStopEvent({ kind: "infusion", key: "remi", startEvent: propofol[0] }, at(60), { continuesAfterEnd: true })
    expect(stop).toMatchObject({ type: "infusion_stop", endCaseStop: true, continuesAfterEnd: true })
    expect(parseLogEvent({ id: "s", ...stop })?.continuesAfterEnd).toBe(true)
    expect(intraopEndCaseStopEvent({ kind: "infusion", key: "remi", startEvent: propofol[0] }, at(60))).not.toHaveProperty("continuesAfterEnd")
  })
})

describe("ops between two logs", () => {
  it("lists what was added, changed and removed", () => {
    const moved = { ...fentanyl, ts: at(20) }
    const added: LogEvent = { id: "n1", ts: at(30), type: "drug", name: "Ondansetron" }
    expect(intraopOpsBetween([fentanyl, tqOn], [moved, added])).toEqual({ add: [added], update: [moved], remove: ["t1"] })
  })
})

describe("linked sections", () => {
  it("knows the airway and vascular entries", () => {
    expect(intraopLinkedSection({ id: "a", ts: at(1), type: "clinical_event", label: "Intubated", intraopPatch: { airwayEventDevice: "ETT" } })).toBe("airway")
    expect(intraopLinkedSection({ id: "b", ts: at(1), type: "clinical_event", label: "Art line in", sourceEventId: "line-1" })).toBe("vascular")
    expect(intraopLinkedSection({ id: "c", ts: at(1), type: "clinical_event", label: "Intubated" })).toBeNull()
  })
})

describe("review fixes (2026-11-23)", () => {
  it("does not call a re-parsed event with its keys in another order an edit", () => {
    const before: LogEvent[] = [{ id: "a", ts: at(10), type: "infusion_start", infId: "i", name: "Propofol", rate: "5", unit: "mg/kg/h" }]
    const reordered: LogEvent[] = [{ unit: "mg/kg/h", rate: "5", name: "Propofol", infId: "i", type: "infusion_start", ts: at(10), id: "a" } as LogEvent]
    expect(intraopOpsBetween(before, reordered)).toEqual({ add: [], update: [], remove: [] })
    expect(intraopOpsBetween(before, [{ ...before[0], rate: "6" }]).update).toHaveLength(1)
  })
})
