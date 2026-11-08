import { describe, expect, it, vi } from "vitest"
import { useClinicalEventHandlers } from "./useClinicalEventHandlers"
import type { TimetableData } from "@/components/IntraopTimetable"

describe("useClinicalEventHandlers", () => {
  // The chart edit is what becomes the event (Core's timetableEditToEventOps).
  it("adds a plain clinical event to the timeline", () => {
    const data: TimetableData = { clinicalEvents: [] } as never
    const onChange = vi.fn()
    const { addClinicalEvent } = useClinicalEventHandlers({ current: data }, { current: onChange })
    addClinicalEvent(3, "Incision", "#ef4444", false)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      clinicalEvents: [{ colIdx: 3, label: "Incision", color: "#ef4444" }],
    }))
  })

  it("keeps likely-now provenance on the timeline marker", () => {
    const data: TimetableData = { clinicalEvents: [] } as never
    const onChange = vi.fn()
    const { addClinicalEvent } = useClinicalEventHandlers({ current: data }, { current: onChange })
    addClinicalEvent(3, "Incision", "#ef4444", false, "succession:Positioned>Incision")
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      clinicalEvents: [{ colIdx: 3, label: "Incision", color: "#ef4444", suggestion: "succession:Positioned>Incision" }],
    }))
  })

  it("keeps the card a shock was made from on its marker (10.2.0)", () => {
    const data: TimetableData = { clinicalEvents: [] } as never
    const onChange = vi.fn()
    const { addDefibrillation } = useClinicalEventHandlers({ current: data }, { current: onChange })
    addDefibrillation(6, 200, false, "card:Ventricular fibrillation:shock")
    addDefibrillation(7, 200, false)
    const [first] = onChange.mock.calls[0]![0].clinicalEvents
    expect(first).toMatchObject({ kind: "defibrillation", suggestion: "card:Ventricular fibrillation:shock" })
    expect(onChange.mock.calls[1]![0].clinicalEvents[0]).not.toHaveProperty("suggestion")
  })

  it("charts a complication as one timed entry, marked as a complication (10.1.0)", () => {
    // Before 10.1.0 a complication went to the list only, without a time. Now
    // it is one entry: the timeline marker, the list and the event log all
    // show the complication event this marker becomes.
    const data: TimetableData = { clinicalEvents: [] } as never
    const onChange = vi.fn()
    const { addClinicalEvent } = useClinicalEventHandlers({ current: data }, { current: onChange })
    addClinicalEvent(5, "Hypotension", "#123456", true)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      clinicalEvents: [{ colIdx: 5, label: "Hypotension", color: "#ef4444", kind: "complication" }],
    }))
  })

  it("charts a shock with its energy and synchronisation (10.1.0)", () => {
    const data: TimetableData = { clinicalEvents: [] } as never
    const onChange = vi.fn()
    const { addDefibrillation } = useClinicalEventHandlers({ current: data }, { current: onChange })
    addDefibrillation(6, 200, false)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      clinicalEvents: [{ colIdx: 6, label: "Defibrillation", color: "#f59e0b", kind: "defibrillation", energyJ: 200, synchronized: false }],
    }))
  })

  it("removes a clinical event by column and label", () => {
    const data: TimetableData = {
      clinicalEvents: [{ colIdx: 3, label: "Incision", color: "#ef4444" }, { colIdx: 7, label: "Closure", color: "#22c55e" }],
    } as never
    const onChange = vi.fn()
    const { removeClinicalEvent } = useClinicalEventHandlers({ current: data }, { current: onChange })
    removeClinicalEvent(3, "Incision")
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      clinicalEvents: [{ colIdx: 7, label: "Closure", color: "#22c55e" }],
    }))
  })
})
