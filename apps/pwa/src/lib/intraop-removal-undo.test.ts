import { describe, expect, it } from "vitest"
import { removalOf, restoreRemoved } from "./intraop-removal-undo"
import type { LogEvent } from "@/lib/intraop-log-event"

const at = (minute: number) => `2026-10-06T08:${String(minute).padStart(2, "0")}:00.000Z`
const log: LogEvent[] = [
  { id: "e1", ts: at(0), type: "clinical_event", label: "Induction", color: "#fff" },
  { id: "i1", ts: at(5), type: "infusion_start", name: "Propofol", infId: "inf-a", rate: 6, unit: "mg/kg/h" },
  { id: "i2", ts: at(10), type: "infusion_rate", name: "Propofol", infId: "inf-a", rate: 4, unit: "mg/kg/h" },
  { id: "i3", ts: at(20), type: "infusion_stop", name: "Propofol", infId: "inf-a" },
] as LogEvent[]

// Found testing 1.5.0: an added event offered Undo, a removed one did not.
describe("undoing a removal", () => {
  it("keeps what a single entry's delete took", () => {
    const { kept, removed } = removalOf(log, log[0])
    expect(removed.map(e => e.id)).toEqual(["e1"])
    expect(kept.map(e => e.id)).toEqual(["i1", "i2", "i3"])
  })

  it("keeps a start's changes and stop with it", () => {
    const { kept, removed } = removalOf(log, log[1])
    expect(removed.map(e => e.id)).toEqual(["i1", "i2", "i3"])
    expect(kept.map(e => e.id)).toEqual(["e1"])
  })

  it("puts them back as new entries at the same times, still one infusion", () => {
    const { kept, removed } = removalOf(log, log[1])
    let n = 0
    const back = restoreRemoved(kept, [{ ...removed[0], syncStatus: "failed", recordedAt: at(6) }, ...removed.slice(1)], () => `new-${++n}`)
    expect(back.map(e => e.id)).toEqual(["e1", "new-1", "new-2", "new-3"])
    expect(back.slice(1).map(e => [e.ts, e.type, e.infId])).toEqual(removed.map(e => [e.ts, e.type, e.infId]))
    expect(back[1].syncStatus).toBeUndefined()
    expect(back[1].recordedAt).toBeUndefined()
  })
})
