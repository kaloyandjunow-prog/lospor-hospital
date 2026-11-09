// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react"
import { useForm, useWatch, type Control } from "react-hook-form"
import { describe, expect, it, vi } from "vitest"
import type { IntraopFormFields } from "@/components/forms/IntraopForm"
import type { IntraopLogEvent } from "@/components/IntraopTimetable"
import { ComplicationsSection } from "./ComplicationsSection"

vi.mock("next-intl", () => ({ useLocale: () => "en" }))

// The section writes times in the browser's zone; so does this.
const hhmm = (ts: string) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` }

const episode: IntraopLogEvent = { id: "ep", type: "complication", ts: "2026-11-01T09:10:00.000Z", endTs: "2026-11-01T09:25:00.000Z", label: "Hypotension", color: "#ef4444", complicationSource: "vitals" } as IntraopLogEvent
const open: IntraopLogEvent = { id: "open", type: "complication", ts: "2026-11-01T09:40:00.000Z", label: "Tachycardia", color: "#ef4444", complicationSource: "vitals" } as IntraopLogEvent
const notNow: IntraopLogEvent = { id: "pa", type: "prompt_answer", ts: "2026-11-01T09:30:00.000Z", answerFor: "r", answerKind: "bradycardia", answer: "not_now" } as IntraopLogEvent

function SavedText({ control }: { control: Control<IntraopFormFields> }) {
  return <output data-testid="saved-text">{useWatch({ control, name: "complications" }) ?? "(none)"}</output>
}

function Harness({ text, log, onDeleteEvent }: { text: string; log: IntraopLogEvent[]; onDeleteEvent?: (id: string) => void }) {
  const { control, watch } = useForm<IntraopFormFields>({ defaultValues: { complications: text } as never })
  return (
    <>
      <ComplicationsSection t={(key: string) => key} control={control} watch={watch} eventLog={log} onDeleteEvent={onDeleteEvent} />
      <SavedText control={control} />
    </>
  )
}

function open_(props: Parameters<typeof Harness>[0]) {
  const view = render(<Harness {...props} />)
  act(() => { fireEvent.click(screen.getByText("intraop.complicationsSummaryTitle")) })
  return view
}
const savedText = () => screen.getByTestId("saved-text").textContent

describe("the complications list on the web (10.1.0)", () => {
  it("lists timed entries with their times, then the old text's items without one", () => {
    open_({ text: "Bronchospasm; settled with salbutamol", log: [open, episode] })
    const rows = [...screen.getByTestId("complications-list").querySelectorAll("li")].map(row => row.textContent)
    expect(rows).toEqual([
      // No delete on a timed entry here: this screen was given no way to delete events.
      `Hypotension${hhmm(episode.ts!)}–${hhmm(episode.endTs!)}`,
      `Tachycardia${hhmm(open.ts!)} · intraop.complicationOpen`,
      "Bronchospasmintraop.complicationNoTimex",
    ])
  })

  it("deletes a timed entry as the event it is, leaving the text alone", () => {
    const onDeleteEvent = vi.fn()
    open_({ text: "Bronchospasm", log: [episode], onDeleteEvent })
    act(() => { fireEvent.click(screen.getByTestId("complication-delete-event:ep")) })
    expect(onDeleteEvent).toHaveBeenCalledWith("ep")
    expect(savedText()).toBe("Bronchospasm")
  })

  it("offers no delete for a timed entry on a screen that cannot delete events", () => {
    open_({ text: "", log: [episode] })
    expect(screen.queryByTestId("complication-delete-event:ep")).toBeNull()
  })

  it("deletes an old item from the web's own text, keeping the notes", () => {
    open_({ text: "Bronchospasm; Aspiration; settled with salbutamol", log: [] })
    act(() => { fireEvent.click(screen.getByTestId("complication-delete-legacy:1:Aspiration")) })
    expect(savedText()).toContain("Bronchospasm")
    expect(savedText()).not.toContain("Aspiration")
    expect(savedText()).toContain("settled with salbutamol")
  })

  // The PWA wrote its old line as "A; B — notes". A case charted on the phone
  // and opened on the web must delete the same way.
  it("deletes an old item from the PWA's text, keeping the notes", () => {
    open_({ text: "Bronchospasm; Aspiration — treated with salbutamol", log: [] })
    act(() => { fireEvent.click(screen.getByTestId("complication-delete-legacy:1:Aspiration")) })
    expect(savedText()).toBe("Bronchospasm — treated with salbutamol")
  })

  it("shows the PWA's notes as notes, and keeps its items when they are edited", () => {
    open_({ text: "Bronchospasm; Aspiration — treated with salbutamol", log: [] })
    const notes = screen.getByPlaceholderText("intraop.complicationsNotesPlaceholder") as HTMLTextAreaElement
    expect(notes.value).toBe("treated with salbutamol")
    act(() => { fireEvent.change(notes, { target: { value: "settled" } }) })
    expect(savedText()).toBe("Bronchospasm; Aspiration — settled")
  })

  it("never lists a Not now in the event log", () => {
    open_({ text: "", log: [episode, notNow] })
    expect(screen.getByTestId("event-log-timeline-stream")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/not_now|bradycardia/i)
  })
})
