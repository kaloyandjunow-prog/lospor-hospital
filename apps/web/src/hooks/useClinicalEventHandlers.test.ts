import { describe, expect, it, vi } from "vitest"
import { useClinicalEventHandlers } from "./useClinicalEventHandlers"
import type { TimetableData } from "@/components/IntraopTimetable"

describe("useClinicalEventHandlers", () => {
  it("adds a plain clinical event to the timeline and emits it", () => {
    const data: TimetableData = { clinicalEvents: [] } as never
    const dataRef = { current: data }
    const onChange = vi.fn()
    const onChangeRef = { current: onChange }
    const emitLogEvent = vi.fn()
    const onComplicationAdded = vi.fn()

    const { addClinicalEvent } = useClinicalEventHandlers(dataRef, onChangeRef, emitLogEvent, onComplicationAdded)
    addClinicalEvent(3, "Incision", "#ef4444", false)

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      clinicalEvents: [{ colIdx: 3, label: "Incision", color: "#ef4444" }],
    }))
    expect(emitLogEvent).toHaveBeenCalledWith({ type: "clinical_event", label: "Incision", color: "#ef4444" })
    expect(onComplicationAdded).not.toHaveBeenCalled()
  })

  it("routes a complication pill to the complications list only -- no clinical_event, no timeline marker", () => {
    // A complication tapped from the quick-pill list used to be recorded
    // twice: once as a clinical_event (synced, and once exported to OMOP
    // with no link back to the real complication), and once as an actual
    // complication. Two tables, no connection between them.
    const data: TimetableData = { clinicalEvents: [] } as never
    const dataRef = { current: data }
    const onChange = vi.fn()
    const onChangeRef = { current: onChange }
    const emitLogEvent = vi.fn()
    const onComplicationAdded = vi.fn()

    const { addClinicalEvent } = useClinicalEventHandlers(dataRef, onChangeRef, emitLogEvent, onComplicationAdded)
    addClinicalEvent(5, "Hypotension", "#ef4444", true)

    expect(onComplicationAdded).toHaveBeenCalledWith(["Hypotension"])
    expect(emitLogEvent).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("removes a clinical event by column and label", () => {
    const data: TimetableData = {
      clinicalEvents: [{ colIdx: 3, label: "Incision", color: "#ef4444" }, { colIdx: 7, label: "Closure", color: "#22c55e" }],
    } as never
    const dataRef = { current: data }
    const onChange = vi.fn()
    const onChangeRef = { current: onChange }

    const { removeClinicalEvent } = useClinicalEventHandlers(dataRef, onChangeRef, vi.fn())
    removeClinicalEvent(3, "Incision")

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      clinicalEvents: [{ colIdx: 7, label: "Closure", color: "#22c55e" }],
    }))
  })
})
