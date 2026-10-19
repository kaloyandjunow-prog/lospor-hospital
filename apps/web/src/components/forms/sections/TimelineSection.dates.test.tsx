// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react"
import { useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { IntraopFormFields } from "@/components/forms/IntraopForm"
import { TimelineSection } from "./TimelineSection"

const SOFIA = "Europe/Sofia"
// 16 Oct 2026, 10:00 in Sofia.
const NOW = new Date("2026-10-16T07:00:00Z")

function Harness({ defaults, onSave }: { defaults: Partial<IntraopFormFields>; onSave: (data: Record<string, unknown>) => void }) {
  const { control, watch, setValue, getValues } = useForm<IntraopFormFields>({ defaultValues: { timezone: SOFIA, ...defaults } as never })
  return (
    <TimelineSection
      t={(key: string) => key}
      control={control}
      watch={watch}
      setValue={setValue}
      getValues={getValues}
      onAutoSave={data => onSave(data as unknown as Record<string, unknown>)}
      timeErrors={{}}
      setTimeErrors={() => {}}
      monDefaultsAppliedRef={{ current: false }}
      setAdvancedMonOpen={() => {}}
      setAirwayExpandedDevice={() => {}}
    />
  )
}

vi.mock("next-intl", () => ({ useLocale: () => "en" }))

describe("the date beside the start and end of surgery", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW) })
  afterEach(() => { vi.useRealTimers() })

  it("starts now with today's date and takes the case month from it", () => {
    const saves: Record<string, unknown>[] = []
    render(<Harness defaults={{}} onSave={data => saves.push(data)} />)
    fireEvent.click(screen.getByText("intraop.timeline.startCase"))
    fireEvent.click(screen.getByText("intraop.timeline.startNow"))
    const saved = saves.at(-1)!
    expect(saved.startedAt).toBe(NOW.toISOString())
    expect(saved.monthYear).toBe("2026-10")
    expect(screen.getByTestId("intraop-start-locked").textContent).toContain("Fri 16.10 · 10:00")
  })

  // Left at "Today", a start time ahead of now still means yesterday, as before.
  it("keeps the old rule when the date is left at today", () => {
    const saves: Record<string, unknown>[] = []
    render(<Harness defaults={{}} onSave={data => saves.push(data)} />)
    fireEvent.click(screen.getByText("intraop.timeline.startCase"))
    fireEvent.click(screen.getByText("intraop.timeline.startAt"))
    fireEvent.change(document.querySelector("input[type=time]")!, { target: { value: "23:30" } })
    fireEvent.click(screen.getByText("intraop.timeline.confirm"))
    // 23:30 on 15 Oct in Sofia.
    expect(saves.at(-1)!.startedAt).toBe("2026-10-15T20:30:00.000Z")
  })

  it("places the start time on a date stepped back", () => {
    const saves: Record<string, unknown>[] = []
    render(<Harness defaults={{}} onSave={data => saves.push(data)} />)
    const stepper = screen.getByTestId("intraop-start-day")
    expect(stepper.textContent).toContain("Today")
    fireEvent.click(stepper.querySelectorAll("button")[0]!)
    fireEvent.click(stepper.querySelectorAll("button")[0]!)
    expect(stepper.textContent).toContain("Wed 14.10")
    // The stepper stops at today.
    expect((stepper.querySelectorAll("button")[1] as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByText("intraop.timeline.startCase"))
    fireEvent.click(screen.getByText("intraop.timeline.startAt"))
    fireEvent.change(document.querySelector("input[type=time]")!, { target: { value: "08:30" } })
    fireEvent.click(screen.getByText("intraop.timeline.confirm"))
    expect(saves.at(-1)!.startedAt).toBe("2026-10-14T05:30:00.000Z")
    expect(saves.at(-1)!.monthYear).toBe("2026-10")
  })

  it("moves the end to another day with the end stepper, and back", () => {
    const saves: Record<string, unknown>[] = []
    render(<Harness
      defaults={{ startTime: "22:40", startedAt: "2026-10-15T19:40:00.000Z", endTime: "23:50", endedAt: "2026-10-15T20:50:00.000Z" } as never}
      onSave={data => saves.push(data)}
    />)
    const stepper = screen.getByTestId("intraop-end-day")
    expect(stepper.textContent).toContain("Yesterday")
    act(() => { fireEvent.click(stepper.querySelectorAll("button")[1]!) })
    expect(saves.at(-1)).toMatchObject({ endedAt: "2026-10-16T20:50:00.000Z", endTimeNextDay: true })
    // It cannot go before the start's date.
    const back = screen.getByTestId("intraop-end-day").querySelectorAll("button")[0] as HTMLButtonElement
    act(() => { fireEvent.click(back) })
    expect(saves.at(-1)).toMatchObject({ endedAt: "2026-10-15T20:50:00.000Z", endTimeNextDay: false })
    expect((screen.getByTestId("intraop-end-day").querySelectorAll("button")[0] as HTMLButtonElement).disabled).toBe(true)
  })
})
