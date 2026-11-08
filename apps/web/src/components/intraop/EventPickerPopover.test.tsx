// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { LikelyEvent } from "@lospor/core/event-succession"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }))
vi.mock("./ui-copy", () => ({ useIntraopUiCopy: () => ({ eventPicker: { none: "none" } }) }))

import { EventPickerPopover, type EventCategory } from "./EventPickerPopover"
import { EventSelectorContext, type EventSelectorState } from "./event-selector-context"

const category = (cat: string, color: string, labels: string[], isComplication = false): EventCategory =>
  ({ cat, color, displayCat: cat, isComplication, events: labels.map(label => ({ label, color, displayLabel: label })) })

const CATEGORIES: EventCategory[] = [
  category("Surgical", "#ef4444", ["Positioned", "Incision"]),
  category("Complications", "#ef4444", ["Hypotension", "Bradycardia"], true),
  category("Cardiovascular", "#ef4444", ["Atrial fibrillation", "Ventricular fibrillation"], true),
  category("Respiratory", "#ef4444", ["Pneumothorax"], true),
]
const ANCHOR = { top: 100, bottom: 120, left: 100, right: 140, width: 40 }
const LIKELY: LikelyEvent[] = [{ event: "Incision", from: "Positioned", probability: 0.9, gapMinutes: 5, minutesSince: 7 }]

function setup(state: Partial<EventSelectorState> = {}, over: { search?: string; recorded?: string[] } = {}) {
  const onToggleEvent = vi.fn()
  const onSearchChange = vi.fn()
  const dismiss = vi.fn()
  render(
    <EventSelectorContext.Provider value={{ screen: "smart", likely: [], dismiss, ...state }}>
      <EventPickerPopover anchor={ANCHOR} search={over.search ?? ""} categories={CATEGORIES} recordedLabels={new Set(over.recorded ?? [])}
        labels={{ logClinicalEvent: "Log", searchEvents: "Search" }} onSearchChange={onSearchChange} onToggleEvent={onToggleEvent} onDismiss={() => {}} />
    </EventSelectorContext.Provider>,
  )
  return { onToggleEvent, onSearchChange, dismiss }
}

describe("the event selector on the web, the new list (10.2.0)", () => {
  it("opens with the categories closed and shows no event yet", () => {
    setup()
    expect(screen.getByTestId("event-category-Surgical")).toBeTruthy()
    expect(screen.getByTestId("event-category-Complications")).toBeTruthy()
    expect(screen.queryByTestId("event-category-Cardiovascular")).toBeNull()
    expect(screen.queryByText("Hypotension")).toBeNull()
  })

  it("opens one category at a time and logs an event in a tap", () => {
    const { onToggleEvent } = setup()
    fireEvent.click(screen.getByTestId("event-category-Surgical"))
    fireEvent.click(screen.getByTestId("event-Incision"))
    expect(onToggleEvent).toHaveBeenCalledWith(expect.objectContaining({ label: "Incision" }), expect.objectContaining({ cat: "Surgical" }), false)
    fireEvent.click(screen.getByTestId("event-category-Complications"))
    expect(screen.queryByText("Incision")).toBeNull()
    expect(screen.getByText("Hypotension")).toBeTruthy()
  })

  it("keeps the complication systems inside Complications, one open at a time", () => {
    setup()
    fireEvent.click(screen.getByTestId("event-category-Complications"))
    expect(screen.getByTestId("event-system-Cardiovascular")).toBeTruthy()
    expect(screen.queryByText("Ventricular fibrillation")).toBeNull()
    fireEvent.click(screen.getByTestId("event-system-Cardiovascular"))
    expect(screen.getByText("Ventricular fibrillation")).toBeTruthy()
    fireEvent.click(screen.getByTestId("event-system-Respiratory"))
    expect(screen.queryByText("Ventricular fibrillation")).toBeNull()
    expect(screen.getByText("Pneumothorax")).toBeTruthy()
  })

  it("tapping an event that is already recorded here removes it", () => {
    const { onToggleEvent } = setup({}, { recorded: ["Incision"] })
    fireEvent.click(screen.getByTestId("event-category-Surgical"))
    fireEvent.click(screen.getByTestId("event-Incision"))
    expect(onToggleEvent).toHaveBeenCalledWith(expect.objectContaining({ label: "Incision" }), expect.anything(), true)
  })

  it("searches every group at once by name and by the words colleagues use, and says when nothing matches", () => {
    setup({}, { search: "low bp" })
    expect(screen.getByText("Hypotension")).toBeTruthy()
    expect(screen.queryByText("Incision")).toBeNull()
  })

  it("finds an event by a Bulgarian word", () => {
    setup({}, { search: "ниско налягане" })
    expect(screen.getByText("Hypotension")).toBeTruthy()
  })

  it("says so when nothing matches", () => {
    setup({}, { search: "zzzz" })
    expect(screen.getByTestId("event-none")).toBeTruthy()
  })
})

describe("likely now on the web (10.2.0)", () => {
  it("shows the likely events above the categories and logs one in a tap", () => {
    const { onToggleEvent } = setup({ likely: LIKELY })
    expect(screen.getByTestId("event-likely")).toBeTruthy()
    fireEvent.click(screen.getByTestId("likely-log-Incision"))
    expect(onToggleEvent).toHaveBeenCalledWith(expect.objectContaining({ label: "Incision" }), expect.objectContaining({ cat: "Surgical" }), false, "succession:Positioned>Incision")
  })

  it("sets one aside with the cross, and ignores one that is not in the list or is a complication", () => {
    const { dismiss } = setup({ likely: [...LIKELY, { ...LIKELY[0]!, event: "Hypotension" }, { ...LIKELY[0]!, event: "Not an event" }] })
    fireEvent.click(screen.getByTestId("likely-dismiss-Incision"))
    expect(dismiss).toHaveBeenCalledWith("succession:Positioned>Incision")
    expect(screen.queryByTestId("likely-log-Hypotension")).toBeNull()
    expect(screen.queryByTestId("likely-log-Not an event")).toBeNull()
  })

  it("leaves the likely events out while searching", () => {
    setup({ likely: LIKELY }, { search: "inc" })
    expect(screen.queryByTestId("event-likely")).toBeNull()
  })
})

describe("the Legacy event selector on the web (Settings)", () => {
  it("is the coloured buttons: every category open at once, with no list and no likely events", () => {
    setup({ screen: "legacy", likely: LIKELY })
    expect(screen.queryByTestId("event-list")).toBeNull()
    expect(screen.queryByTestId("event-likely")).toBeNull()
    expect(screen.getByText("Incision")).toBeTruthy()
    expect(screen.getByText("Hypotension")).toBeTruthy()
    expect(screen.getByText("Ventricular fibrillation")).toBeTruthy()
  })

  it("searches by the same words, and toggles an event as it did", () => {
    const { onToggleEvent } = setup({ screen: "legacy" }, { search: "low bp" })
    expect(screen.queryByText("Incision")).toBeNull()
    fireEvent.click(screen.getByText("Hypotension"))
    expect(onToggleEvent).toHaveBeenCalledWith(expect.objectContaining({ label: "Hypotension" }), expect.anything(), false)
  })
})
