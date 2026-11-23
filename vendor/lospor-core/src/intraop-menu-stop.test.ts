import { describe, expect, it } from "vitest"
import { intraopMenuStopEvent } from "./intraop-commands"
import type { LogEvent } from "./intraop-types"

describe("the menu's stop", () => {
  const t0 = Date.parse("2026-11-23T08:00:00.000Z")
  const at = (min: number) => new Date(t0 + min * 60_000).toISOString()
  const run: LogEvent[] = [{ id: "s", ts: at(3), type: "infusion_start", infId: "i1", name: "Propofol", rate: "5", unit: "mg/kg/h" }]

  it("stops at the cell's time, with what the lane asked", () => {
    const stop = intraopMenuStopEvent(run, { kind: "infusion", key: "i1" }, at(10), at(20), { pumpTotal: 180 })
    expect(stop).toMatchObject({ type: "infusion_stop", infId: "i1", ts: at(10), recordedAt: at(20), pumpTotal: 180 })
  })
  it("never stops before the start: the cell the run began in gives a minute after it", () => {
    expect(intraopMenuStopEvent(run, { kind: "infusion", key: "i1" }, at(0), at(20)).ts).toBe(at(4))
    // ... but not after now
    expect(intraopMenuStopEvent(run, { kind: "infusion", key: "i1" }, at(0), at(3.5)).ts).toBe(at(3.5))
  })
  it("plans a stop in a later cell as it is", () => {
    expect(intraopMenuStopEvent(run, { kind: "infusion", key: "i1" }, at(40), at(20)).ts).toBe(at(40))
  })
  it("writes each kind's own stop", () => {
    expect(intraopMenuStopEvent([], { kind: "fluid", key: "f" }, at(1), at(2))).toMatchObject({ type: "fluid_end", fluidId: "f" })
    expect(intraopMenuStopEvent([], { kind: "agent", key: "Sevoflurane" }, at(1), at(2))).toMatchObject({ type: "agent_stop", name: "Sevoflurane", agentMode: "concurrent" })
    expect(intraopMenuStopEvent([], { kind: "gas", key: "gas" }, at(1), at(2)).type).toBe("gas_stop")
    expect(intraopMenuStopEvent([], { kind: "jet", key: "jet" }, at(1), at(2)).type).toBe("jet_stop")
  })
  it("stops the run the clicked cell belongs to, not the latest restart", () => {
    const twice: LogEvent[] = [
      { id: "s1", ts: at(0), type: "infusion_start", infId: "i1", name: "Propofol", rate: "5", unit: "mg/kg/h" },
      { id: "e1", ts: at(30), type: "infusion_stop", infId: "i1" },
      { id: "s2", ts: at(45), type: "infusion_start", infId: "i1", name: "Propofol", rate: "5", unit: "mg/kg/h" },
    ]
    expect(intraopMenuStopEvent(twice, { kind: "infusion", key: "i1" }, at(15), at(60)).ts).toBe(at(15))
  })
})
