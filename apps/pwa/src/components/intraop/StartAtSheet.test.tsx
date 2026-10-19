import React from "react"
import { describe, expect, it, vi } from "vitest"
import { act } from "react-test-renderer"
import { render } from "@/test/render"
import { StartAtSheet } from "./StartAtSheet"
import { startInstantForEntry } from "@/lib/intraop-timing"

vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ language: "en", tc: (key: string) => key }) }))
vi.mock("@/theme/shade", () => ({ useShade: () => (hex: string) => hex }))
vi.mock("@/theme/colors", () => ({ colors: {}, useShade: () => (hex: string) => hex }))
vi.mock("./Sheet", () => ({ Sheet: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

const SOFIA = "Europe/Sofia"
// 16 Oct 2026, 10:00 in Sofia.
const NOW = new Date("2026-10-16T07:00:00Z")

describe("where a typed start time lands", () => {
  it("left at today, a past time is today and a time ahead of now is yesterday", () => {
    expect(startInstantForEntry(NOW, "08:30", null, SOFIA)?.toISOString()).toBe("2026-10-16T05:30:00.000Z")
    expect(startInstantForEntry(NOW, "08:30", "2026-10-16", SOFIA)?.toISOString()).toBe("2026-10-16T05:30:00.000Z")
    expect(startInstantForEntry(NOW, "23:00", null, SOFIA)?.toISOString()).toBe("2026-10-15T20:00:00.000Z")
  })

  it("a stepped day places the time on that day, even a later clock time", () => {
    expect(startInstantForEntry(NOW, "23:00", "2026-10-13", SOFIA)?.toISOString()).toBe("2026-10-13T20:00:00.000Z")
  })
})

// The Start at sheet took only HH:MM, so a case could start only today or
// yesterday, though the Time tab steps two weeks back.
describe("the Start at sheet on the PWA", () => {
  const sheet = (onDayChange = vi.fn()) => render(
    <StartAtSheet visible value="08:30" onClose={() => {}} onChange={() => {}}
      dayKey="2026-10-16" todayKey="2026-10-16" onDayChange={onDayChange} onStart={() => {}} />,
  )

  it("offers the start date, from today back", () => {
    const onDayChange = vi.fn()
    const tree = sheet(onDayChange)
    const stepper = tree.root.find(node => node.props.testID === "intraop-start-at-day" && typeof node.type !== "string")
    expect(stepper.props).toMatchObject({ value: "2026-10-16", max: "2026-10-16", min: "2026-10-02" })
    const back = stepper.findAll(node => node.props.accessibilityRole === "button" && typeof node.props.onPress === "function" && typeof node.type !== "string")[0]!
    act(() => { back.props.onPress() })
    expect(onDayChange).toHaveBeenCalledWith("2026-10-15")
  })
})

describe("the day the sheet's start lands on", () => {
  it("is today until stepped, and stepping back to today clears it", async () => {
    const { startAtDayProps } = await import("@/lib/intraop-timing")
    const setStartAtDayKey = vi.fn()
    const props = (startAtDayKey: string | null) => startAtDayProps(startAtDayKey, "2026-10-16", setStartAtDayKey)
    expect(props(null).dayKey).toBe("2026-10-16")
    expect(props("2026-10-12").dayKey).toBe("2026-10-12")
    props("2026-10-12").onDayChange("2026-10-16")
    expect(setStartAtDayKey).toHaveBeenLastCalledWith(null)
    props(null).onDayChange("2026-10-13")
    expect(setStartAtDayKey).toHaveBeenLastCalledWith("2026-10-13")
  })
})
