import { describe, expect, it } from "vitest"
import { intraopDeleteHere, intraopMoveEvent } from "./intraop-edits"
import type { LogEvent } from "./intraop-types"

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 22, 8, minutes)).toISOString()

// 10.8.0 (rule 9): an event from the Airway or Vascular section is one with its entry there.
describe("airway and vascular events and their section", () => {
  const tube = { id: "tube", device: "ORAL_ETT", details: {}, status: "in_use", insertedAt: at(5), sourceEventId: "intubated" }
  const intubated = {
    id: "intubated", ts: at(5), type: "clinical_event", label: "Intubated",
    intraopPatch: { airwayDeviceEntries: [tube] },
  } as unknown as LogEvent
  const line = { id: "iv", site: "VEN_PERIPHERAL", insertedAt: at(2), sourceEventId: "iv-in" }
  const ivIn = { id: "iv-in", ts: at(2), type: "clinical_event", label: "IV line in", intraopPatch: { vascularAccesses: [line] } } as unknown as LogEvent

  it("Delete takes the device off the section, with an explicit removal the server applies", () => {
    const next = intraopDeleteHere([intubated, ivIn], "intubated")
    expect(next.find(event => event.id === "intubated")).toBeUndefined()
    const note = next.find(event => event.id === "section-intubated")
    expect(note?.intraopPatch).toEqual({ airwayDeviceEntries: [], removedSourceEventIds: ["intubated"] })
  })

  it("Delete of a vascular event removes its line", () => {
    const note = intraopDeleteHere([intubated, ivIn], "iv-in").find(event => event.id === "section-iv-in")
    expect(note?.intraopPatch).toEqual({ vascularAccesses: [], removedSourceEventIds: ["iv-in"] })
  })

  it("Move moves the time in the section too", () => {
    const result = intraopMoveEvent([intubated], "intubated", at(9), { now: at(30), startedAt: at(0), endedAt: null })
    const moved = result.ok ? result.events.find(event => event.id === "intubated") : null
    expect(moved?.ts).toBe(at(9))
    expect((moved?.intraopPatch as { airwayDeviceEntries: { insertedAt: string }[] }).airwayDeviceEntries[0]!.insertedAt).toBe(at(9))
  })

  it("leaves an ordinary event alone", () => {
    const induction = { id: "ind", ts: at(1), type: "clinical_event", label: "Induction" } as LogEvent
    expect(intraopDeleteHere([induction], "ind")).toEqual([])
  })
})
