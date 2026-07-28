import { describe, expect, it, vi } from "vitest"
import type { LogEvent } from "./intraop-log-event"
import { buildIntraopEventActions, repeatDrugEventPayload } from "./intraop-event-actions"

const ev = (event: Partial<LogEvent>): LogEvent => event as LogEvent

describe("repeatDrugEventPayload", () => {
  it("copies the drug fields needed for a repeated dose event", () => {
    expect(repeatDrugEventPayload(ev({
      type: "drug",
      name: "Fentanyl",
      dose: "50",
      unit: "mcg",
      category: "Opioids",
      color: "#fff",
      ts: "ignored",
      id: "ignored",
    }))).toEqual({
      type: "drug",
      name: "Fentanyl",
      dose: "50",
      unit: "mcg",
      category: "Opioids",
      color: "#fff",
    })
  })
})

describe("buildIntraopEventActions", () => {
  it("builds repeat/edit/delete/cancel actions for drug events", () => {
    const repeatDrug = vi.fn()
    const editEvent = vi.fn()
    const deleteEvent = vi.fn()
    const actions = buildIntraopEventActions({
      event: ev({ type: "drug" }),
      cancelLabel: "Cancel",
      repeatDrug,
      editEvent,
      deleteEvent,
    })

    expect(actions.map(action => action.label)).toEqual(["Repeat dose", "Edit dose/time", "Delete", "Cancel"])
    expect(actions[2].destructive).toBe(true)
    expect(actions[3].cancel).toBe(true)
    actions[0].onPress?.()
    actions[1].onPress?.()
    actions[2].onPress?.()
    expect(repeatDrug).toHaveBeenCalledOnce()
    expect(editEvent).toHaveBeenCalledOnce()
    expect(deleteEvent).toHaveBeenCalledOnce()
  })

  it("builds edit-time/delete/cancel actions for non-drug events", () => {
    const actions = buildIntraopEventActions({
      event: ev({ type: "clinical_event" }),
      cancelLabel: "Cancel",
      repeatDrug: vi.fn(),
      editEvent: vi.fn(),
      deleteEvent: vi.fn(),
    })

    expect(actions.map(action => action.label)).toEqual(["Edit time", "Delete", "Cancel"])
  })
})
