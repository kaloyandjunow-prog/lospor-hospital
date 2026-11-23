import { describe, expect, it } from "vitest"
import { intraopStillRunningQuestion, intraopStopAt } from "./intraop-edits"
import type { LogEvent } from "./intraop-types"

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 22, 8, minutes)).toISOString()
const chartStart = at(0)

// 10.8.0 (rule 3): a start charted in an earlier cell is asked about at once.
describe("still running?", () => {
  const start: LogEvent = { id: "a1", ts: at(10), type: "agent_start", name: "Sevoflurane", agentMode: "concurrent" }
  const known = new Set<string>()

  it("asks about a start just entered in an earlier cell", () => {
    expect(intraopStillRunningQuestion([start], { knownIds: known, answeredIds: new Set(), now: at(40), chartStart })?.id).toBe("a1")
  })

  it("does not ask about one already there when the screen opened, one answered, or one in now's cell", () => {
    expect(intraopStillRunningQuestion([start], { knownIds: new Set(["a1"]), answeredIds: new Set(), now: at(40), chartStart })).toBeNull()
    expect(intraopStillRunningQuestion([start], { knownIds: known, answeredIds: new Set(["a1"]), now: at(40), chartStart })).toBeNull()
    expect(intraopStillRunningQuestion([{ ...start, ts: at(41) }], { knownIds: known, answeredIds: new Set(), now: at(42), chartStart })).toBeNull()
  })

  it("does not ask about entries made before the screen opened (a log that loads late)", () => {
    const old = { ...start, recordedAt: at(12) }
    expect(intraopStillRunningQuestion([old], { knownIds: known, answeredIds: new Set(), now: at(40), chartStart, enteredSince: at(39) })).toBeNull()
    expect(intraopStillRunningQuestion([{ ...start, recordedAt: at(40) }], { knownIds: known, answeredIds: new Set(), now: at(40), chartStart, enteredSince: at(39) })?.id).toBe("a1")
  })

  it("does not ask when the start came with its stop", () => {
    const stopped: LogEvent[] = [start, { id: "s1", ts: at(20), type: "agent_stop", name: "Sevoflurane", agentMode: "concurrent" }]
    expect(intraopStillRunningQuestion(stopped, { knownIds: known, answeredIds: new Set(), now: at(40), chartStart })).toBeNull()
  })

  it("answers 'it stopped at' with a stop at that time, never before the start", () => {
    const context = { now: at(40), startedAt: at(0), endedAt: null }
    const result = intraopStopAt([start], "a1", at(25), context)
    expect(result.ok && result.events.find(event => event.type === "agent_stop")).toMatchObject({ ts: at(25), name: "Sevoflurane" })
    expect(intraopStopAt([start], "a1", at(5), context)).toMatchObject({ ok: false })
  })

  it("does not ask about a start that began earlier than charted: a later start of the same agent shows it ran on", () => {
    const earlier: LogEvent = { id: "a0", ts: at(5), type: "agent_start", name: "Sevoflurane", value: "2.5", agentMode: "concurrent", recordedAt: at(39) }
    const later: LogEvent = { ...start, id: "a1", value: "2", recordedAt: at(1) }
    expect(intraopStillRunningQuestion([earlier, later], { knownIds: new Set(["a1"]), answeredIds: new Set(), now: at(40), chartStart })).toBeNull()
    // with a stop between the two, the earlier run ended: that start is asked about
    const withStop: LogEvent[] = [earlier, { id: "s0", ts: at(8), type: "agent_stop", name: "Sevoflurane", agentMode: "concurrent" }, later]
    expect(intraopStillRunningQuestion(withStop, { knownIds: new Set(["a1"]), answeredIds: new Set(), now: at(40), chartStart })).toBeNull() // it is stopped, not running
  })
})

describe("how far back a start is asked about", () => {
  const known = new Set<string>()
  const ask = (startMin: number, nowMin: number) => intraopStillRunningQuestion(
    [{ id: "a", ts: at(startMin), type: "infusion_start", infId: "i", name: "Propofol", rate: "5", unit: "mg/kg/h" }],
    { knownIds: known, answeredIds: new Set(), now: at(nowMin), chartStart },
  )
  it("does not ask about a start written down five or twenty minutes late, even in an earlier cell", () => {
    expect(ask(36, 41)).toBeNull()
    expect(ask(20, 40)).toBeNull()
  })
  it("asks once it is half an hour back or more", () => {
    expect(ask(10, 40)?.id).toBe("a")
    expect(ask(5, 60)?.id).toBe("a")
  })

  it("judges the start by when it was written, not by the clock: one entered live is not asked half an hour later", () => {
    const start: LogEvent = { id: "a1", ts: at(10), type: "agent_start", name: "Sevoflurane", agentMode: "concurrent" }
    const live: LogEvent = { ...start, ts: at(40), recordedAt: at(40) }
    expect(intraopStillRunningQuestion([live], { knownIds: new Set(), answeredIds: new Set(), now: at(80), chartStart })).toBeNull()
    const late: LogEvent = { ...start, ts: at(10), recordedAt: at(60) }
    expect(intraopStillRunningQuestion([late], { knownIds: new Set(), answeredIds: new Set(), now: at(61), chartStart })?.id).toBe("a1")
  })
})
