import { describe, expect, it } from "vitest"

import {
  intraopCanFinalise,
  intraopEndCaseStopEvent,
  intraopRunningItemsAt,
  validateIntraopTimeline,
} from "./intraop-commands"
import { projectIntraopEvents } from "./intraop-engine"
import { calculateDeliveredFluidTotals } from "./intraop-totals"
import type { LogEvent } from "./intraop-types"

// The timeline rules and the time engine for fluids, agents and gas (9.13.0
// coverage review): the first tests pinned these for infusions only.

const start = "2026-09-27T14:00:00.000Z"
const at = (minutes: number) => new Date(Date.parse(start) + minutes * 60_000).toISOString()
const last = <T>(items: T[]): T => items[items.length - 1]
const read = (events: LogEvent[], minutes: number) => projectIntraopEvents(events, { start, openThrough: at(minutes) })

describe("a stop dated after now, for every kind of bar", () => {
  const events: LogEvent[] = [
    { id: "f", ts: at(0), type: "fluid_start", fluidId: "fl", name: "Ringer", category: "Crystalloids", fluidEntryMode: "RATE", rate: "600", unit: "mL/h" },
    { id: "fe", ts: at(40), type: "fluid_end", fluidId: "fl" },
    { id: "a", ts: at(0), type: "agent_start", name: "Sevoflurane", value: "2", agentMode: "concurrent" },
    { id: "ae", ts: at(40), type: "agent_stop", name: "Sevoflurane", agentMode: "concurrent" },
    { id: "g", ts: at(0), type: "gas_start", fgf: 2, carrierGas: "air", fio2: 50 },
    { id: "ge", ts: at(40), type: "gas_stop" },
  ]

  it("is drawn as a planned stop and the bar keeps running until then", () => {
    const chart = read(events, 20)
    expect(chart.fluids[0]).toMatchObject({ stopped: false, plannedStopCol: 8, stopEventId: "fe" })
    expect(chart.agents[0]).toMatchObject({ plannedStopCol: 8, stopEventId: "ae" })
    expect(chart.agents[0].stopped).toBeFalsy()
    expect(last(chart.gasSettings!)).toMatchObject({ plannedStopCol: 8, stopEventId: "ge" })
    expect(last(chart.gasSettings!).stopped).toBeFalsy()
  })

  it("counts only the time that has passed", () => {
    expect(read(events, 20).fluids[0].endTs).toBeUndefined()
    expect(calculateDeliveredFluidTotals(read(events, 20).fluids, at(20)).crystalloids).toBe(200)
  })

  it("applies once its minute has passed", () => {
    const chart = read(events, 50)
    expect(chart.fluids[0]).toMatchObject({ stopped: true, endCol: 8 })
    expect(chart.agents[0]).toMatchObject({ stopped: true, endCol: 8 })
    expect(last(chart.gasSettings!)).toMatchObject({ stopped: true, endCol: 8 })
  })
})

describe("a gas change dated after now", () => {
  it("is drawn as planned and the running settings stay", () => {
    const chart = read([
      { id: "g", ts: at(0), type: "gas_start", fgf: 2, carrierGas: "air", fio2: 50 },
      { id: "gc", ts: at(30), type: "gas_start", fgf: 1, carrierGas: "air", fio2: 30 },
    ], 10)
    const running = chart.gasSettings!.find(item => !item.planned)!
    expect(running).toMatchObject({ fio2: 50 })
    expect(chart.gasSettings!.some(item => item.planned && item.fio2 === 30)).toBe(true)
  })
})

describe("the timeline rules", () => {
  it("refuse an entry before the case start or after its end", () => {
    const issues = validateIntraopTimeline([
      { id: "early", ts: at(-5), type: "drug", name: "Midazolam", dose: "2", unit: "mg" },
      { id: "late", ts: at(95), type: "drug", name: "Ondansetron", dose: "4", unit: "mg" },
      { id: "ok", ts: at(30), type: "drug", name: "Fentanyl", dose: "50", unit: "mcg" },
    ], { startedAt: start, endedAt: at(90) })
    expect(issues).toEqual([
      { code: "BEFORE_CASE_START", eventId: "early" },
      { code: "AFTER_CASE_END", eventId: "late" },
    ])
  })

  it("let a new gas start replace the running settings, but not a fluid start its own running bag", () => {
    expect(validateIntraopTimeline([
      { id: "g1", ts: at(0), type: "gas_start", fgf: 2, carrierGas: "air", fio2: 50 },
      { id: "g2", ts: at(10), type: "gas_start", fgf: 1, carrierGas: "air", fio2: 40 },
    ])).toEqual([])
    expect(validateIntraopTimeline([
      { id: "f1", ts: at(0), type: "fluid_start", fluidId: "fl", name: "Ringer" },
      { id: "f2", ts: at(10), type: "fluid_start", fluidId: "fl", name: "Ringer" },
    ])).toEqual([{ code: "ALREADY_RUNNING", eventId: "f2", relatedEventId: "f1" }])
  })

  it("refuse a legacy unnamed agent stop when no agent is running", () => {
    expect(validateIntraopTimeline([{ id: "s", ts: at(5), type: "agent_stop" }]))
      .toEqual([expect.objectContaining({ code: "NOT_RUNNING", eventId: "s" })])
  })
})

describe("what is running at End case", () => {
  const events: LogEvent[] = [
    { id: "a1", ts: at(0), type: "agent_start", name: "Sevoflurane", value: "2" },
    { id: "a2", ts: at(10), type: "agent_start", name: "Desflurane", value: "6" },
    { id: "g", ts: at(0), type: "gas_start", fgf: 2, carrierGas: "air", fio2: 50 },
    { id: "g2", ts: at(20), type: "gas_start", fgf: 1, carrierGas: "air", fio2: 40 },
  ]

  it("a legacy agent start ends the one before; a gas restart is one item", () => {
    const running = intraopRunningItemsAt(events, at(30))
    expect(running.map(item => `${item.kind}:${item.key}`).sort()).toEqual(["agent:Desflurane", "gas:gas"])
    expect(running.find(item => item.kind === "gas")!.startEvent.id).toBe("g2")
  })

  it("an unnamed legacy stop ends every agent", () => {
    const running = intraopRunningItemsAt([...events, { id: "s", ts: at(25), type: "agent_stop" }], at(30))
    expect(running.map(item => item.kind)).toEqual(["gas"])
  })

  it("stops for an agent and the gas carry the End case marker", () => {
    const running = intraopRunningItemsAt(events, at(30))
    const agent = running.find(item => item.kind === "agent")!
    const gas = running.find(item => item.kind === "gas")!
    expect(intraopEndCaseStopEvent(agent, at(30))).toEqual({ type: "agent_stop", ts: at(30), name: "Desflurane", agentMode: "concurrent", endCaseStop: true })
    expect(intraopEndCaseStopEvent(gas, at(30))).toEqual({ type: "gas_stop", ts: at(30), endCaseStop: true })
  })

  it("a case that has not ended cannot be finalised", () => {
    expect(intraopCanFinalise(events, null)).toBe(false)
  })
})
