// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ClinicalEventsLane, MAX_VISIBLE_EVENTS } from "./TimetablePointLanes"

// Found 2026-11-11: the chips (8px text, 12px tall) filled the 34px cell after two events, so a third could not be
// added by clicking the cell. A strip below the chips is always there now, and the chips are bigger.

type LaneEvent = { colIdx: number; label: string; color: string; kind?: string; eventId?: string; planned?: boolean }
const event = (colIdx: number, label: string): LaneEvent => ({ colIdx, label, color: "#6366f1", eventId: `${colIdx}-${label}` })

function lane(events: LaneEvent[]) {
  const onOpenPicker = vi.fn()
  const onRemove = vi.fn()
  render(
    <ClinicalEventsLane
      label="Events" labelWidth={90} rowLabelClass="" rowCols={[0, 1]} colW={74}
      events={events as never} displayEventName={name => name} onOpenPicker={onOpenPicker} onRemove={onRemove}
    />,
  )
  return { onOpenPicker, onRemove }
}

describe("the events lane", () => {
  it("keeps a place to click in every cell that has events, however many", () => {
    lane([event(0, "Induction"), event(0, "Intubated"), event(0, "Incision")])
    expect(screen.getByTestId("events-lane-add-0")).toBeTruthy()
    expect(screen.queryByTestId("events-lane-add-1")).toBeNull() // an empty cell has its own plus
  })

  it("opens the picker from that place, and from the cell, without removing anything", () => {
    const { onOpenPicker, onRemove } = lane([event(0, "Induction"), event(0, "Intubated")])
    fireEvent.click(screen.getByTestId("events-lane-add-0"))
    expect(onOpenPicker).toHaveBeenCalledTimes(1)
    expect(onOpenPicker.mock.calls[0]![0]).toBe(0)
    expect(onRemove).not.toHaveBeenCalled()
  })

  it("still removes an event from its own chip, and the click does not also open the picker", () => {
    const { onOpenPicker, onRemove } = lane([event(0, "Induction"), event(0, "Intubated")])
    fireEvent.click(screen.getByText("Intubated"))
    expect(onRemove).toHaveBeenCalledWith(0, "Intubated")
    expect(onOpenPicker).not.toHaveBeenCalled()
  })

  it("makes the chips a comfortable target", () => {
    lane([event(0, "Induction")])
    const chip = screen.getByText("Induction").parentElement!
    expect(chip.className).toContain("min-h-[20px]")
  })

  it("shows what is hidden as a count beyond the limit, with the add place still there", () => {
    const many = Array.from({ length: MAX_VISIBLE_EVENTS + 2 }, (_, i) => event(0, `Event ${i}`))
    lane(many)
    expect(screen.getAllByTestId(/events-lane-chip/)).toHaveLength(MAX_VISIBLE_EVENTS)
    expect(screen.getByTestId("events-lane-more-0").textContent).toBe("+2")
    expect(screen.getByTestId("events-lane-add-0")).toBeTruthy()
  })
})
